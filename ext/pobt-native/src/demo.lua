-- pobt: a few of POB's own edit boxes on their own, in place of POB's Launch.lua: to try input methods, text in
-- other scripts, the caret and translated labels by hand (`POBT_DEMO=1 nsh run`, then play a game), and what
-- host.rs's tests type into. It loads POB's Common module and classes from POB's folder, as POB does.

launch = { devMode = true }
-- As POB's main: the parts its edit boxes and tooltips read.
main = {
	unicode = type(_G.utf8) == "table",
	showFlavourText = false,
	WrapString = function(_, s) return { s } end,
}
data = { costs = { } }
itemLib = { wiki = { matchesKey = function() return false end } }

LoadModule("Modules/Common")
LoadModule("Data/Global")

-- A gem box needs a skills tab and gems: a few, as POB's data has them.
local function gem(name, color, tags)
	return { name = name, tagString = "", tags = tags, grantedEffect = { color = color, levels = { { levelRequirement = 1 } } } }
end
local skillsTab = {
	showSupportGemTypes = "ALL",
	displayGroup = { gemList = { } },
	socketGroupList = { },
	build = {
		characterLevel = 1,
		outputRevision = 1,
		data = {
			gems = {
				Fireball = gem("Fireball", 3, { spell = true, fire = true, grants_active_skill = true }),
				Frostbolt = gem("Frostbolt", 3, { spell = true, cold = true, grants_active_skill = true }),
				Arc = gem("Arc", 3, { spell = true, lightning = true, grants_active_skill = true }),
				Cleave = gem("Cleave", 1, { attack = true, grants_active_skill = true }),
			},
		},
		-- No calculations: no sorting by damage, no tooltips with stats.
		calcsTab = { GetMiscCalculator = function() return nil, { } end },
	},
	GetMouseOverControl = function() end,
}

demo = new("ControlHost"):ControlHost()
demo.inputEvents = { }
demo.gemId = nil
local c = demo.controls
local function label(y, text)
	return new("LabelControl"):LabelControl({ "TOPLEFT", nil, "TOPLEFT" }, { 20, y, 0, 16 }, text)
end
c.title = label(20, "^7POBT text input demo: type with an input method, Backspace and Delete over 中文 and 한국어")
-- Any text, as POB's search boxes take it.
c.plainLabel = label(62, "^7Notes")
c.plain = new("EditControl"):EditControl({ "TOPLEFT", nil, "TOPLEFT" }, { 160, 60, 360, 20 }, "", nil, "%c")
-- A prompt and a placeholder, POB's words: translated.
c.search = new("EditControl"):EditControl({ "TOPLEFT", nil, "TOPLEFT" }, { 160, 90, 360, 20 }, "", "Search", "%c", 100)
c.search:SetPlaceholder("Name")
-- POB's default filter (no filter given), as in its rename boxes.
c.defaultLabel = label(122, "^7Name")
c.default = new("EditControl"):EditControl({ "TOPLEFT", nil, "TOPLEFT" }, { 160, 120, 360, 20 }, "")
-- Several lines, as the notes tab.
c.multi = new("EditControl"):EditControl({ "TOPLEFT", nil, "TOPLEFT" }, { 160, 150, 360, 100 }, "中文 한국어 English\n第二行 둘째 줄", nil, "^%C\t\n", nil, nil, 16)
-- A gem: searched by its translated name, shown translated until focused.
c.gemLabel = label(262, "^7Gem")
c.gem = new("GemSelectControl"):GemSelectControl({ "TOPLEFT", nil, "TOPLEFT" }, { 160, 260, 360, 20 }, skillsTab, 1, function(gemId)
	demo.gemId = gemId
end)
c.sample = label(420, "^7Fireball  ^xB97123Level^7 20  中文 한국어")

-- Focuses the box `name` (tests).
function demo:Focus(name)
	self:SelectControl(self.controls[name])
end

function demo:OnInit()
	self:Focus("plain")
end

function demo:OnFrame()
	local w, h = GetScreenSize()
	local viewPort = { x = 0, y = 0, width = w, height = h }
	self:ProcessControlsInput(self.inputEvents, viewPort)
	wipeTable(self.inputEvents)
	SetDrawColor(0.05, 0.05, 0.05)
	DrawImage(nil, 0, 0, w, h)
	self:DrawControls(viewPort)
end

function demo:OnKeyDown(key, doubleClick)
	table.insert(self.inputEvents, { type = "KeyDown", key = key, doubleClick = doubleClick })
end

function demo:OnKeyUp(key)
	table.insert(self.inputEvents, { type = "KeyUp", key = key })
end

function demo:OnChar(key)
	table.insert(self.inputEvents, { type = "Char", key = key })
end

SetMainObject(demo)
