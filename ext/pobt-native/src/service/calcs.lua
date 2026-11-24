-- The calcs page's operations ("calcs.<op>"), on the build POB holds. `s` is service.lua's shared table: s.build(),
-- s.control(c), s.act(c, value), s.at(path), s.json.
--
-- Everything is read from POB's own Calcs tab (Classes/CalcsTab.lua): its sections (Classes/CalcSectionControl.lua,
-- Modules/CalcSections.lua), shown by POB's own flag checks, each cell formatted by POB's formatCalcStr; a cell's
-- breakdown is POB's CalcBreakdownControl filled by its own SetBreakdownData.
return function(s)
	local ops = { }

	local function tab()
		return assert(s.build().calcsTab, "no Calcs tab")
	end

	-- The actor the tab shows (CalcSectionControl:Draw).
	local function actorOf(t)
		local env = t.calcsEnv
		return env and (t.input.showMinion and env.minion or env.player)
	end

	local function check(t, obj)
		local ok, v = pcall(t.CheckFlag, t, obj)
		return ok and v and true or false
	end

	local function fmt(str, actor, colData)
		local ok, v = pcall(formatCalcStr, str, actor, colData)
		return ok and tostring(v) or ""
	end

	-- Whether pressing a cell shows anything (CalcBreakdownControl:SetBreakdownData: a breakdown or a mod list).
	local function hasDetail(colData)
		for _, sd in ipairs(colData) do
			if type(sd) == "table" and (sd.breakdown or sd.modName) then
				return true
			end
		end
		return false
	end

	-- `{ sections }`: every section of the tab, in POB's order, with POB's colour, width (in columns) and layout group;
	-- a section POB does not show for this skill has `enabled = false` and no rows. A row: its label (POB colour
	-- codes), its cells' text as POB draws it, and whether a cell has a breakdown. The skill selection section carries
	-- its controls (as service.lua reads them) and their paths from the build, for `act`.
	function ops.read()
		local t = tab()
		local actor = actorOf(t)
		local sections = { }
		for si, section in ipairs(t.sectionList) do
			-- what POB does before drawing a section: decides which rows show, fills the skill selection controls
			if actor then
				pcall(section.UpdateSize, section)
			end
			local enabled = actor ~= nil and check(t, section)
			local subs = { }
			local any = false
			for ui, sub in ipairs(section.subSection) do
				local rows = { }
				if enabled then
					for ri, rowData in ipairs(sub.data) do
						if check(t, rowData) then
							any = true
							local cells = { }
							local controls
							for ci, colData in ipairs(rowData) do
								if colData.control then
									controls = controls or { }
									local c = s.control(colData.control) or { }
									c.name = colData.controlName
									c.path = { "calcsTab", "sectionList", si, "controls", colData.controlName }
									if colData.control.tooltipText and type(colData.control.tooltipText) == "string" then
										c.tooltip = colData.control.tooltipText
									end
									controls[#controls + 1] = c
								elseif colData.format and check(t, colData) then
									cells[#cells + 1] = { col = ci, text = fmt(colData.format, actor, colData), detail = hasDetail(colData) or nil }
								else
									cells[#cells + 1] = { col = ci, text = "" }
								end
							end
							rows[#rows + 1] = { row = ri, label = rowData.label, color = rowData.color, cells = cells, controls = controls }
						end
					end
				end
				subs[ui] = {
					id = sub.id,
					label = sub.label,
					collapsed = sub.collapsed and true or false,
					extra = enabled and sub.data.extra and fmt(sub.data.extra, actor) or nil,
					rows = rows,
				}
			end
			sections[si] = {
				id = section.id,
				group = section.group,
				colour = section.colour,
				cols = section.widthCols or 1,
				enabled = enabled and any,
				subsections = subs,
			}
		end
		return { sections = sections, showMinion = t.input.showMinion and true or false, revision = s.build().outputRevision }
	end

	-- A tooltip that keeps the lines POB adds to it (the totals behind a mod row's source).
	local function collector()
		local lines = { }
		local tip = { lines = lines }
		function tip:AddLine(size, text)
			lines[#lines + 1] = { text = tostring(text or ""), size = size }
		end
		function tip:AddSeparator()
			lines[#lines + 1] = { sep = true }
		end
		function tip:CheckForUpdate()
			return true
		end
		function tip:Clear()
		end
		return tip
	end

	local MAX_ROWS = 400

	-- A breakdown table's cell as CalcBreakdownControl:Draw writes it: numbers (and "x to y", "(...)") through POB's
	-- formatNumSep, words as they are.
	local function cellText(v, col)
		local str = tostring(v)
		local _, alpha = string.gsub(str, "%a", " ")
		local _, notes = string.gsub(str, " to ", " ")
		local _, paren = string.gsub(str, "%b()", " ")
		if alpha == 0 or notes > 0 or paren > 0 then
			return formatNumSep(str)
		end
		return str
	end

	-- `{ section, sub, row, col }` (1-based, as `read` numbers them): the breakdown POB shows for that cell, as its
	-- CalcBreakdownControl lists it — TEXT lines, a RADIUS, TABLEs (label, footer, columns, rows of cell text in POB's
	-- colour codes, `tip`: the tooltip lines behind a row's source, `{ text, size }` or `{ sep }`) — or none.
	function ops.breakdown(a)
		local t = tab()
		local section = assert(t.sectionList[tonumber(a.section)], "no such section")
		local sub = assert(section.subSection[tonumber(a.sub)], "no such subsection")
		local rowData = assert(sub.data[tonumber(a.row)], "no such row")
		local colData = assert(rowData[tonumber(a.col)], "no such cell")
		local bd = t.controls.breakdown
		bd:SetBreakdownData()
		bd:SetBreakdownData(colData, true)
		local parts = { }
		if bd.shown then
			for _, sec in ipairs(bd.sectionList or { }) do
				if sec.type == "TEXT" then
					local lines = { }
					for i, l in ipairs(sec.lines) do
						-- as CalcBreakdownControl:Draw writes a line
						lines[i] = formatNumSep(tostring(l))
					end
					parts[#parts + 1] = { type = "TEXT", lines = lines }
				elseif sec.type == "RADIUS" then
					parts[#parts + 1] = { type = "RADIUS", radius = sec.radius }
				elseif sec.type == "TABLE" then
					-- POB draws only the columns some row fills (SetBreakdownData gives the others no width)
					local cols = { }
					for _, c in ipairs(sec.colList) do
						for _, r in ipairs(sec.rowList) do
							if r[c.key] then
								cols[#cols + 1] = { key = c.key, label = c.label, right = c.right and true or nil }
								break
							end
						end
					end
					local rows = { }
					for i, r in ipairs(sec.rowList) do
						if i > MAX_ROWS then
							break
						end
						local row = { }
						for _, c in ipairs(cols) do
							local v = r[c.key]
							if v and type(v) ~= "table" and type(v) ~= "function" then -- POB draws a cell only when it has a value
								row[c.key] = cellText(v, c)
							end
						end
						if type(r.sourceTooltip) == "function" then
							local tip = collector()
							if pcall(r.sourceTooltip, tip) then
								row.tip = tip.lines
							end
						end
						rows[#rows + 1] = row
					end
					parts[#parts + 1] = {
						type = "TABLE",
						label = sec.label,
						footer = sec.footer,
						columns = cols,
						rows = rows,
						more = #sec.rowList > MAX_ROWS and #sec.rowList - MAX_ROWS or nil,
					}
				end
			end
		end
		-- leave POB's tab as it was: nothing pinned
		bd:SetBreakdownData()
		t.displayData = nil
		t.displayPinned = nil
		return { parts = parts }
	end

	-- `{ section, sub, collapsed }`: folds or unfolds a subsection, as its +/- button does (saved with the build).
	function ops.collapse(a)
		local t = tab()
		local section = assert(t.sectionList[tonumber(a.section)], "no such section")
		local sub = assert(section.subSection[tonumber(a.sub)], "no such subsection")
		sub.collapsed = a.collapsed and true or false
		t.modFlag = true
		return { }
	end

	-- `{ on }`: the "Show Minion Stats" check box (POB keeps its state in the tab's input; it starts unset, which the
	-- generic `act` does not take).
	function ops.showMinion(a)
		local t = tab()
		local c = assert(t.sectionList[1].controls.showMinion, "no minion check box")
		c.state = a.on and true or false
		c.changeFunc(c.state)
		return { }
	end

	return ops
end
