-- POBT's build screens served by the official Path of Building, with no window (host/service.rs). Each request is an
-- operation on the build POB holds; changes go through POB's own controls (a drop-down's selection, an edit box's
-- text, a check box), so whatever POB does on them, now and in every update, happens. Answers are JSON.
--
-- An operation returns its answer (a table), or `nil, frames` to have POB run that many frames first (opening a build,
-- recalculating) and be called again as `__after`.
local dkjson = require("dkjson")

local ops = { }
local after

local function build()
	return main.modes["BUILD"]
end

-- A check box, by its class: one never set has no `state` yet (nil reads as unchecked).
local function isCheck(c)
	return c.changeFunc ~= nil and (c._className == "CheckBoxControl" or c.state ~= nil)
end

-- A control as the screens show it: what it is, whether POB shows and enables it, and its value.
local function control(c)
	if not c then
		return nil
	end
	local function call(f, ...)
		if type(f) == "function" then
			local ok, v = pcall(f, c, ...)
			return ok and v
		end
	end
	local out = {
		shown = c.IsShown == nil or call(c.IsShown) and true or false,
		enabled = c.IsEnabled == nil or call(c.IsEnabled) and true or false,
		label = type(c.label) == "string" and c.label or (type(c.label) == "function" and call(c.label)) or nil,
	}
	if c.SetSel and c.list then
		out.kind = "list"
		out.sel = c.selIndex
		out.items = { }
		for i, v in ipairs(c.list) do
			out.items[i] = type(v) == "table" and (v.label or v.val and tostring(v.val)) or tostring(v)
		end
	elseif c.buf ~= nil and c.SetText then
		out.kind = "edit"
		out.text = c.buf
		out.placeholder = c.placeholder
	elseif isCheck(c) then
		out.kind = "check"
		out.checked = c.state and true or false
	else
		out.kind = "other"
	end
	return out
end

-- Acts on a control as the user would: `value` is the 1-based index for a list, the text for an edit box, a boolean
-- for a check box. POB's own handler runs.
local function act(c, value)
	assert(c, "no such control")
	if c.SetSel and c.list then
		c:SetSel(tonumber(value))
	elseif c.buf ~= nil and c.SetText then
		c:SetText(tostring(value), true)
	elseif isCheck(c) then
		c.state = value and true or false
		c.changeFunc(c.state)
	else
		error("that control takes no value")
	end
end

-- The control at `path` from the build (`{"controls","mainSocketGroup"}`, `{"configTab","varControls","enemyLevel"}`).
local function at(path)
	local v = build()
	for _, k in ipairs(path) do
		assert(type(v) == "table", "no such control")
		v = v[k]
	end
	return v
end

-- What `ops` modules share.
local service = { build = build, control = control, act = act, at = at, json = dkjson }

function ops.init()
	return { version = launch.versionNumber or "" }
end

-- Opens a build: `{ xml }`, or `{ code }` (a build code), named `name`.
function ops.open(a)
	local xml = a.xml
	if not xml or xml == "" then
		local code = tostring(a.code or ""):gsub("%s", "")
		xml = Inflate(common.base64.decode(code:gsub("-", "+"):gsub("_", "/")))
		assert(xml and xml ~= "", "this is not a Path of Building build code")
	end
	main:SetMode("BUILD", false, a.name or "POBT", xml)
	after = function()
		local b = build()
		assert(b and b.calcsTab and b.calcsTab.mainOutput, "Path of Building did not open the build")
		return ops.summary()
	end
	return nil, 3
end

-- POB's builds folder, as its build list shows it (Modules/BuildListHelpers.lua): the folder `subPath` ("" for the
-- top, "Folder/Sub/" below), or every match of `filter` in all folders; sorted by `sort` (NAME, CLASS, EDITED, LEVEL;
-- POB's own choice when none). The same files Path of Building opens and saves.
local helpers = require("Modules.BuildListHelpers")
function ops.builds(a)
	local subPath = a.subPath or ""
	local index = helpers.ScanFolder("")
	local list = helpers.FilterList(index, subPath, a.filter or "")
	local sort = a.sort or main.buildSortMode or "NAME"
	helpers.SortList(list, sort)
	local out = { }
	for i, e in ipairs(list) do
		out[i] = {
			folder = e.folderName,
			name = e.buildName,
			subPath = e.subPath,
			path = e.fullFileName,
			modified = e.modified,
			level = e.level,
			className = e.className,
			ascendClassName = e.ascendClassName,
		}
	end
	return { buildPath = main.buildPath, subPath = subPath, sort = sort, list = out }
end

-- Tests only: points POB at another builds folder, so tests never touch the user's.
function ops.__buildPath(a)
	main.buildPath = a.path
	return { }
end

-- Opens the build file `path` (from `builds`) as POB's build list does, so saving writes it back.
function ops.openFile(a)
	main:SetMode("BUILD", a.path, a.name)
	after = function()
		local b = build()
		assert(b and b.calcsTab and b.calcsTab.mainOutput, "Path of Building did not open the build")
		return ops.summary()
	end
	return nil, 3
end

-- A new, empty build, as POB's "New" does.
function ops.new()
	main:SetMode("BUILD", false, "Unnamed build")
	after = function()
		return ops.summary()
	end
	return nil, 3
end

-- Saves the build to its file; one never saved (or `{ name, subPath }` given: Save As) goes to `subPath..name..".xml"`
-- in the builds folder. Answers where it went.
function ops.save(a)
	local b = build()
	if a.name and a.name ~= "" then
		local file = main.buildPath .. (a.subPath or "") .. a.name .. ".xml"
		local existing = file ~= b.dbFileName and io.open(file, "r")
		if existing then
			existing:close()
			if not a.overwrite then
				return { exists = file }
			end
		end
		b.dbFileName = file
		b.buildName = a.name
		b.dbFileSubPath = a.subPath or ""
	end
	if not b.dbFileName then
		return { needsName = true }
	end
	assert(not b:SaveDBFile(), "Path of Building could not save the build to " .. b.dbFileName)
	return { path = b.dbFileName, unsaved = b.unsaved and true or false }
end

-- Where a build site's link downloads from, by POB's own list of sites (Modules/BuildSiteTools.lua); null when POB
-- knows no such site.
function ops.link(a)
	local url = tostring(a.url or ""):gsub("^%s+", ""):gsub("%s+$", "")
	for _, site in ipairs(buildSites and buildSites.websiteList or { }) do
		if site.matchURL and url:match(site.matchURL) and site.downloadURL then
			local id = url:match(site.regexURL)
			if id then
				return "https://" .. site.downloadURL:gsub("%%1", (id:gsub("%%", "%%%%")))
			end
		end
	end
	return dkjson.null
end

-- The build code of the build, as POB's Import/Export tab gives it.
function ops.export()
	local xml = assert(build():SaveDB("code"), "Path of Building could not save the build")
	return { code = (common.base64.encode(Deflate(xml)):gsub("+", "-"):gsub("/", "_")), xml = xml }
end

-- Who the build is: class, ascendancy, level, points.
function ops.summary()
	local b = build()
	local spec = b.spec
	local used, ascUsed = 0, 0
	if spec then
		used, ascUsed = spec:CountAllocNodes()
	end
	return {
		name = b.buildName,
		path = b.dbFileName or dkjson.null,
		className = spec and spec.curClassName or "",
		ascendClassName = spec and spec.curAscendClassName or "",
		level = b.characterLevel,
		pointsUsed = used,
		ascUsed = ascUsed,
		-- POB's points line as it draws it ("^7118 / 123   ^78 / 8"), and what it explains it with
		points = b.controls.pointDisplay and b.controls.pointDisplay.str or "",
		pointsReq = b.controls.pointDisplay and b.controls.pointDisplay.req or "",
		unsaved = b.unsaved and true or false,
		revision = b.outputRevision,
	}
end

-- The sidebar, exactly as POB fills it: the main skill controls, the stat list (`{ left, right }` lines in POB's
-- colour codes; a line with neither is a gap) and the warnings.
function ops.sidebar()
	local b = build()
	local c = b.controls
	local lines = { }
	for _, line in ipairs(c.statBox.list or { }) do
		lines[#lines + 1] = { left = line[1], right = line[2], center = line.align == "CENTER_X" or nil }
	end
	local warnings = { }
	for _, w in ipairs(c.warnings.lines or { }) do
		warnings[#warnings + 1] = w
	end
	return {
		summary = ops.summary(),
		mainSocketGroup = control(c.mainSocketGroup),
		mainSkill = control(c.mainSkill),
		mainSkillPart = control(c.mainSkillPart),
		mainSkillStageCount = control(c.mainSkillStageCount),
		mainSkillMineCount = control(c.mainSkillMineCount),
		mainSkillMinion = control(c.mainSkillMinion),
		mainSkillMinionSkill = control(c.mainSkillMinionSkill),
		lines = lines,
		warnings = warnings,
	}
end

-- Acts on a control (`{ path, value }`), then lets POB recalculate.
function ops.act(a)
	act(at(a.path), a.value)
	after = function()
		return { revision = build().outputRevision }
	end
	return nil, 1
end

-- Reads a control (`{ path }`).
function ops.control(a)
	return control(at(a.path)) or dkjson.null
end

-- Runs POB's frames, for a change made some other way to settle (`buildFlag`).
function ops.settle()
	after = function()
		return { revision = build().outputRevision }
	end
	return nil, 1
end

-- The modules of the pages (service/*.lua), each a table of operations named `<page>.<op>`.
function __pobt_register(name, module)
	for op, f in pairs(module(service)) do
		ops[name .. "." .. op] = f
	end
end

return function(op, args)
	local f
	if op == "__after" then
		f, after = after, nil
		assert(f, "nothing to resume")
	else
		f = ops[op]
		assert(f, "Path of Building has no operation " .. op)
	end
	local a = args ~= "" and dkjson.decode(args) or { }
	local ok, res, frames = xpcall(function()
		return f(a)
	end, debug.traceback)
	if not ok then
		return dkjson.encode({ err = tostring(res) })
	end
	if res == nil and frames then
		return nil, frames
	end
	return dkjson.encode({ ok = res == nil and dkjson.null or res }, { exception = function(reason, value)
		return dkjson.null
	end })
end
