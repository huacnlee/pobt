-- pobt: the SimpleGraphic API for Path of Building, over the natives in
-- the global __sg table. Argument checks that raise errors live here, as
-- the natives never raise.

local sg = __sg
local unpack = unpack or table.unpack
local select, type, error, tostring = select, type, error, tostring

local function pack(...)
	return { n = select("#", ...), ... }
end

package.path = package.path .. ";lua/?.lua;lua/?/init.lua"

-- The script and its arguments, as SimpleGraphic passes them.
arg = { [0] = "Launch.lua" }

local scriptPath, runtimePath, userPath = sg.Paths()
local workDir = scriptPath

-- Callbacks

local callbacks = { }
local mainObject

function SetCallback(name, func)
	callbacks[name] = func
end

function GetCallback(name)
	return callbacks[name]
end

function SetMainObject(object)
	mainObject = object
end

function __pobt_call(name, ...)
	local cb = callbacks[name]
	if cb then
		return cb(...)
	end
	if mainObject and mainObject[name] then
		return mainObject[name](mainObject, ...)
	end
end

-- Image handles

local imgMeta = { }
imgMeta.__index = imgMeta

local function checkHandle(h, method)
	if getmetatable(h) ~= imgMeta then
		error("imgHandle:" .. method .. "() must be used on an image handle", 3)
	end
end

function NewImageHandle()
	return setmetatable({ }, imgMeta)
end

local function resolve(fileName)
	if fileName:match("^%a:[/\\]") or fileName:match("^[/\\]") then
		return fileName
	end
	return fileName
end

function imgMeta:Load(fileName, ...)
	checkHandle(self, "Load")
	if type(fileName) ~= "string" then
		error("imgHandle:Load() argument 1: expected string, got " .. type(fileName), 2)
	end
	self.id, self.width, self.height, self.layers = sg.ImgLoad(resolve(fileName))
end

local function setFromArt(self, id, w, h)
	self.id, self.width, self.height, self.layers = id, w, h, 1
end

function imgMeta:LoadArtRectangle(art, x1, y1, x2, y2)
	checkHandle(self, "LoadArtRectangle")
	if art and art.id then
		local id, w, h = sg.ArtRect(art.id, x1, y1, x2, y2)
		if id then setFromArt(self, id, w, h) end
	end
end

function imgMeta:LoadArtArcBand(art, xC, yC, rMin, rMax)
	checkHandle(self, "LoadArtArcBand")
	if art and art.id then
		local id, w, h = sg.ArtArc(art.id, xC, yC, rMin, rMax)
		if id then setFromArt(self, id, w, h) end
	end
end

function imgMeta:Unload()
	self.id = nil
end

function imgMeta:IsValid()
	return self.id ~= nil
end

function imgMeta:IsLoading()
	if not self.id then
		error("imgHandle:IsLoading(): image handle has no image loaded", 2)
	end
	return false
end

function imgMeta:SetLoadingPriority(pri)
end

function imgMeta:ImageSize()
	if not self.id then
		error("imgHandle:ImageSize(): image handle has no image loaded", 2)
	end
	return self.width, self.height
end

local artMeta = { }
artMeta.__index = artMeta

function NewArtHandle(fileName)
	local id, w, h = sg.ArtLoad(fileName)
	if not id then
		return nil
	end
	return setmetatable({ id = id, width = w, height = h }, artMeta)
end

function artMeta:Size()
	return self.width, self.height
end

-- Rendering

function RenderInit(...)
end

GetScreenSize = sg.GetScreenSize

function GetScreenScale()
	return 1
end

local dpiOverride = 0
function SetDPIScaleOverridePercent(percent)
	dpiOverride = percent
end
function GetDPIScaleOverridePercent()
	return dpiOverride
end

SetClearColor = sg.SetClearColor
GetDrawLayer = sg.GetDrawLayer
GetDrawColor = sg.GetDrawColor
StripEscapes = sg.StripEscapes

function SetDrawLayer(layer, subLayer)
	if layer == nil and subLayer == nil then
		error("SetDrawLayer(): must provide subLayer if layer is nil", 2)
	end
	sg.SetDrawLayer(layer, subLayer)
end

function SetViewport(x, y, width, height)
	if x then
		sg.SetViewport(x, y, width, height)
	else
		sg.SetViewport()
	end
end

function SetDrawColor(r, g, b, a)
	if type(r) == "string" then
		sg.SetDrawColor(r)
	else
		if type(r) ~= "number" or type(g) ~= "number" or type(b) ~= "number" then
			error("Usage: SetDrawColor(red, green, blue[, alpha]) or SetDrawColor(escapeStr)", 2)
		end
		sg.SetDrawColor(r, g, b, a)
	end
end

local function imageId(h, fn)
	if h == nil then
		return false
	end
	if getmetatable(h) ~= imgMeta then
		error(fn .. "() argument 1: expected image handle or nil, got " .. type(h), 3)
	end
	if not h.id then
		error(fn .. "(): image handle has no image loaded", 3)
	end
	return h.id
end

local drawImage, drawImageQuad = sg.DrawImage, sg.DrawImageQuad

function DrawImage(h, ...)
	return drawImage(imageId(h, "DrawImage"), ...)
end

function DrawImageQuad(h, ...)
	return drawImageQuad(imageId(h, "DrawImageQuad"), ...)
end

local drawString, drawStringWidth, drawStringCursorIndex = sg.DrawString, sg.DrawStringWidth, sg.DrawStringCursorIndex

function DrawString(left, top, align, height, font, text)
	if text == nil then
		error("Usage: DrawString(left, top, align, height, font, text)", 2)
	end
	return drawString(left, top, align or "LEFT", height, font, tostring(text))
end

function DrawStringWidth(height, font, text)
	return drawStringWidth(height, font, tostring(text))
end

function DrawStringCursorIndex(height, font, text, cursorX, cursorY)
	return drawStringCursorIndex(height, font, tostring(text), cursorX, cursorY)
end

function GetAsyncCount()
	return 0
end

-- Texture objects (POB2 uses them to stack textures offline only)
Texture = { }

-- Files

local searchMeta = { }
searchMeta.__index = searchMeta

function NewFileSearch(spec, findDirectories)
	local list = sg.FileSearch(spec, findDirectories and true or false)
	if #list == 0 then
		return nil
	end
	return setmetatable({ list = list, i = 1 }, searchMeta)
end

function searchMeta:NextFile()
	self.i = self.i + 1
	return self.list[self.i] ~= nil or nil
end

function searchMeta:GetFileName()
	return self.list[self.i].name
end

function searchMeta:GetFileSize()
	return self.list[self.i].size
end

function searchMeta:GetFileModifiedTime()
	return self.list[self.i].modified
end

function GetCloudProvider(path)
	return nil
end

-- General

SetWindowTitle = sg.SetWindowTitle
GetCursorPos = sg.GetCursorPos
IsKeyDown = sg.IsKeyDown
Copy = sg.Copy
Paste = sg.Paste
Deflate = sg.Deflate
Inflate = sg.Inflate
GetTime = sg.GetTime
MakeDir = sg.MakeDir
RemoveDir = sg.RemoveDir
LaunchSubScript = sg.LaunchSubScript
AbortSubScript = sg.AbortSubScript
IsSubScriptRunning = sg.IsSubScriptRunning
SpawnProcess = sg.SpawnProcess
Restart = sg.Restart
Exit = sg.Exit
os.exit = sg.Exit

function SetCursorPos(x, y) end
function ShowCursor(doShow) end
function SetProfiling(isEnabled) end
function TakeScreenshot() end
function SetForeground() end

function OpenURL(url)
	sg.OpenURL(url)
end

function GetScriptPath()
	return scriptPath, scriptPath
end

function GetRuntimePath()
	return runtimePath, runtimePath
end

function GetUserPath()
	return userPath, userPath
end

function SetWorkDir(path)
	workDir = path
end

function GetWorkDir()
	return workDir
end

-- Modules

local function traceback(err)
	return debug.traceback(tostring(err), 2)
end

local function moduleFile(name)
	if not name:match("%.[^/\\]+$") then
		name = name .. ".lua"
	end
	return name
end

function LoadModule(name, ...)
	local file = moduleFile(name)
	sg.Step()
	local chunk, err = loadfile(file)
	if not chunk then
		error("LoadModule() error loading '" .. file .. "':\n" .. tostring(err), 2)
	end
	return chunk(...)
end

function PLoadModule(name, ...)
	local file = moduleFile(name)
	sg.Step()
	local chunk, err = loadfile(file)
	if not chunk then
		return err
	end
	local r = pack(xpcall(chunk, traceback, ...))
	if not r[1] then
		return r[2]
	end
	return nil, unpack(r, 2, r.n)
end

function PCall(func, ...)
	local r = pack(xpcall(func, traceback, ...))
	if not r[1] then
		return r[2]
	end
	return nil, unpack(r, 2, r.n)
end

-- Console

local log = sg.Log

function ConPrintf(fmt, ...)
	log(string.format(fmt, ...))
end

function ConPrintTable(tbl, noRecurse)
	local seen = { }
	local function dump(t, indent)
		for k, v in pairs(t) do
			if type(v) == "table" and not noRecurse and not seen[v] then
				seen[v] = true
				log(indent .. tostring(k) .. " = {")
				dump(v, indent .. "  ")
				log(indent .. "}")
			else
				log(indent .. tostring(k) .. " = " .. tostring(v))
			end
		end
	end
	dump(tbl, "")
end

function ConExecute(cmd) end
function ConClear() end

function print(...)
	local parts = { }
	for i = 1, select("#", ...) do
		parts[i] = tostring((select(i, ...)))
	end
	log(table.concat(parts, " "))
end

-- Text in edit boxes is what the user typed: never translate it. Their labels ("Level", "Search") and
-- placeholders are POB's: translated before the box draws.
function __pobt_hookClasses()
	local classes = common and common.classes
	if not classes then
		return
	end
	__pobt_hookEdit(classes)
	__pobt_hookGemSelect(classes)
end

function __pobt_hookEdit(classes)
	if not classes.EditControl or rawget(classes.EditControl, "__pobt") or type(classes.EditControl.Draw) ~= "function" then
		return
	end
	local edit = classes.EditControl
	local draw = edit.Draw
	edit.Draw = function(self, ...)
		local prompt, placeholder = self.prompt, self.placeholder
		if type(prompt) == "string" then
			self.prompt = sg.Translate(prompt)
		end
		if type(placeholder) == "string" then
			self.placeholder = sg.Translate(placeholder)
		end
		-- A gem's name, which POB keeps in English, shown translated until the box is focused to edit it.
		local buf = self.buf
		local gem = self._className == "GemSelectControl" and not self.hasFocus and type(buf) == "string"
		if gem then
			self.buf = sg.Translate(buf)
		end
		sg.SetRawText(true)
		-- The focused box from its caret on: where text typed with an input method goes, and its candidates show.
		if self.hasFocus and self.GetPos and self.GetSize then
			local x, y = self:GetPos()
			local w, h = self:GetSize()
			local textHeight = self.lineHeight or (h - 4)
			local caretX = x + 2
			if self.prompt then
				caretX = caretX + DrawStringWidth(textHeight, self.font, self.prompt) + textHeight / 2
			end
			local pre = type(self.buf) == "string" and self.buf:sub(1, (self.caret or 1) - 1):match("[^\n]*$") or ""
			local scroll = self.controls and self.controls.scrollBarH and self.controls.scrollBarH.offset or 0
			caretX = math.min(math.max(caretX + DrawStringWidth(textHeight, self.font, pre) - scroll, x), x + w - 1)
			sg.SetTextInput(caretX, y, x + w - caretX, h)
		end
		local r = pack(pcall(draw, self, ...))
		sg.SetRawText(false)
		self.prompt, self.placeholder = prompt, placeholder
		if gem then
			self.buf = buf
		end
		if not r[1] then
			error(r[2], 0)
		end
		return unpack(r, 2, r.n)
	end
	-- POB deletes a byte at a time: Backspace and Delete take the whole of a character UTF-8 writes in several.
	local keyDown = edit.OnKeyDown
	edit.OnKeyDown = function(self, key, ...)
		local buf, caret = self.buf, self.caret
		if (key == "BACK" or key == "DELETE") and type(buf) == "string" and caret
			and not (self.sel and self.sel ~= caret) and not IsKeyDown("CTRL") then
			if key == "BACK" and caret > 1 then
				local start = caret - 1
				while start > 1 and buf:byte(start) >= 0x80 and buf:byte(start) < 0xC0 do
					start = start - 1
				end
				if start < caret - 1 then
					self.sel = start
				end
			elseif key == "DELETE" and caret <= #buf then
				local stop = caret + 1
				while stop <= #buf and buf:byte(stop) >= 0x80 and buf:byte(stop) < 0xC0 do
					stop = stop + 1
				end
				if stop > caret + 1 then
					self.sel = stop
				end
			end
		end
		return keyDown(self, key, ...)
	end
	-- A box that takes letters takes only English ones (POB's default filter, a gem box's): it takes the
	-- characters of other scripts too, to name things and search gems by their translated names. Boxes for
	-- numbers keep their filters.
	local function lettersAndScripts(self, f, ...)
		local filter = self.filterPattern
		if type(filter) == "string" and filter:sub(1, 2) == "[^" and (filter:find("%%a") or filter:find("%%w")) then
			self.filterPattern = "[^\128-\255" .. filter:sub(3)
		end
		local r = pack(pcall(f, self, ...))
		self.filterPattern = filter
		if not r[1] then
			error(r[2], 0)
		end
		return unpack(r, 2, r.n)
	end
	local insert, replaceSel = edit.Insert, edit.ReplaceSel
	edit.Insert = function(self, ...)
		return lettersAndScripts(self, insert, ...)
	end
	edit.ReplaceSel = function(self, ...)
		return lettersAndScripts(self, replaceSel, ...)
	end
	edit.__pobt = true
end

function __pobt_hookGemSelect(classes)
	-- A search in another script matches the gems' translated names: they stand in for the English while POB
	-- builds its list.
	local gemSelect = classes.GemSelectControl
	-- A class reads what its parents have (POB's newClass copies it in): the edit box's mark is not the gem box's.
	if gemSelect and type(gemSelect.BuildList) == "function" and not rawget(gemSelect, "__pobt") then
		local buildList = gemSelect.BuildList
		gemSelect.BuildList = function(self, buf, ...)
			if type(buf) ~= "string" or not buf:find("[\128-\255]") or type(self.gems) ~= "table" then
				return buildList(self, buf, ...)
			end
			local names = { }
			for _, gem in pairs(self.gems) do
				if type(gem) == "table" and type(gem.name) == "string" and names[gem] == nil then
					names[gem] = gem.name
					gem.name = sg.Translate(gem.name)
				end
			end
			local r = pack(pcall(buildList, self, buf, ...))
			for gem, name in pairs(names) do
				gem.name = name
			end
			if not r[1] then
				error(r[2], 0)
			end
			return unpack(r, 2, r.n)
		end
		gemSelect.__pobt = true
	end
end

-- POB's error popups also go to the log.
function __pobt_hookLaunch()
	if not launch or launch.__pobt then
		return
	end
	local show = launch.ShowErrMsg
	if type(show) == "function" then
		launch.ShowErrMsg = function(self, fmt, ...)
			log("POB error: " .. string.format(fmt, ...))
			return show(self, fmt, ...)
		end
	end
	launch.__pobt = true
end
