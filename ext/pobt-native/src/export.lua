-- A character from an account, made a build by Path of Building's own import (its Import tab's), on a POB that POBT
-- runs with no window: `host::export` calls it a stage at a time, with a frame between, as POB changes mode in one.
local stage, a, b, c = ...
local dkjson = require("dkjson")

if stage == "new" then
	-- This POB is not the user's: it keeps their settings as they are.
	main.SaveSettings = function() end
	main:SetMode("BUILD", false, a)
	return
end

local build = main.modes["BUILD"]
assert(build and build.importTab, "Path of Building did not open a build")

if stage == "import" then
	local char = assert(dkjson.decode(a), "the character is not JSON")
	local items = assert(dkjson.decode(b), "the items are not JSON")
	local passives = assert(dkjson.decode(c), "the passive tree is not JSON")
	local importTab = build.importTab
	local tree = build.latestTree

	-- Tencent names the class in Chinese: its ids name it as the tree does.
	local class = tree.classes[char.classId]
	if class and (not char.class or char.class:match("[\128-\255]") or not (tree.classNameMap[char.class] or tree.ascendNameMap[char.class])) then
		local ascend = class.classes[char.ascendancyClass or 0]
		char.class = (ascend and ascend.name ~= "None") and ascend.name or class.name
	end
	char.league = char.league or ""
	char.level = char.level or (items.character and items.character.level) or 1

	-- Support gems whose name the account gives without " Support".
	local function fixGems(list)
		for _, item in ipairs(list or { }) do
			for _, gem in ipairs(item.socketedItems or { }) do
				local name = gem.typeLine and sanitiseText(gem.typeLine):lower()
				if name and not build.data.gemForBaseName[name] and build.data.gemForBaseName[name .. " support"] then
					gem.typeLine = gem.typeLine .. " Support"
				end
			end
		end
	end
	fixGems(items.items)
	fixGems(passives.items)

	-- A tattoo POB does not know by its name (Tencent's words for it): the one with its stats, or none, the node left
	-- as the tree has it.
	local tattoos = build.spec.tree.tattoo and build.spec.tree.tattoo.nodes or { }
	for nodeId, override in pairs(passives.skill_overrides or { }) do
		if not tattoos[override.name] then
			local stats = table.concat(override.stats or { }, "\n")
			local found
			for name, node in pairs(tattoos) do
				if node.sd and table.concat(node.sd, "\n") == stats then
					found = name
					break
				end
			end
			if found then
				override.name = found
			else
				ConPrintf("Unknown tattoo in imported tree: %s", tostring(override.name))
				passives.skill_overrides[nodeId] = nil
			end
		end
	end
	passives.hashes = passives.hashes or { }
	passives.hashes_ex = passives.hashes_ex or { }
	-- As its Import tab does for an account's character.
	passives.bandit_choice = passives.bandit_choice or build.configTab.input.bandit
	passives.pantheon_major = passives.pantheon_major or build.configTab.input.pantheonMajorGod
	passives.pantheon_minor = passives.pantheon_minor or build.configTab.input.pantheonMinorGod
	local charData = copyTable(char)
	charData.passives = passives
	charData.jewels = passives.items
	importTab:ImportPassiveTreeAndJewels(charData, true)
	charData = copyTable(char)
	charData.equipment = items.items or { }
	charData.guardian = items.guardian
	importTab:ImportItemsAndSkills(charData, true, true, false)
	return
end

if stage == "save" then
	local xml = assert(build:SaveDB("code"), "Path of Building could not save the build")
	local code = common.base64.encode(Deflate(xml)):gsub("+", "-"):gsub("/", "_")
	return code, xml, main.buildPath or ""
end
