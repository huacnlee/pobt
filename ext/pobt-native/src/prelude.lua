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

-- Text in edit boxes is what the user typed: never translate it.
function __pobt_hookClasses()
	local classes = common and common.classes
	if not classes or not classes.EditControl or classes.EditControl.__pobt or type(classes.EditControl.Draw) ~= "function" then
		return
	end
	local edit = classes.EditControl
	local draw = edit.Draw
	edit.Draw = function(...)
		sg.SetRawText(true)
		local r = pack(pcall(draw, ...))
		sg.SetRawText(false)
		if not r[1] then
			error(r[2], 0)
		end
		return unpack(r, 2, r.n)
	end
	edit.__pobt = true
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
