-- The skills page's operations ("skills.<op>"), on the build POB holds. `s` is service.lua's shared table: s.build(),
-- s.control(c), s.act(c, value), s.at(path), s.json.
--
-- Everything goes through POB's own Skills tab (Classes/SkillsTab.lua, SkillListControl.lua, GemSelectControl.lua):
-- a group is shown with SetDisplayGroup, then the tab's controls for that group act as the user would use them, so
-- POB's handlers (ProcessSocketGroup, gem level rules, undo, buildFlag) run. Groups and gems are 1-based indexes.
local gemTooltip = require("Classes.GemTooltip")

return function(s)
	local ops = { }

	local function tab()
		return s.build().skillsTab
	end

	-- The tab's lines of a Tooltip that POB filled: `{ text, size }`, a separator as `{ sep = true }`.
	local function tooltipLines(fill)
		local tip = s.tooltip()
		local ok = pcall(fill, tip)
		local out = { }
		if ok then
			for _, line in ipairs(tip.lines) do
				if line.text then
					out[#out + 1] = { text = line.text, size = line.size }
				else
					out[#out + 1] = { sep = true }
				end
			end
		end
		return out
	end

	-- Shows group `i` in the tab's detail controls, as a click on it in the list does (SkillListControl:OnSelect).
	local function display(i)
		local st = tab()
		local group = st.socketGroupList[i]
		assert(group, "no such socket group")
		local list = st.controls.groupList
		list.selIndex = i
		list.selValue = group
		if st.displayGroup ~= group then
			st:SetDisplayGroup(group)
		else
			st:UpdateGemSlots()
		end
		return st, group
	end

	local function gemSlot(st, group, gem)
		st:UpdateGemSlots()
		local slot = st.gemSlots[gem]
		assert(slot and gem <= #group.gemList + 1, "no such gem")
		return slot
	end

	local function grantedEffect(gem)
		return gem.grantedEffect or (gem.gemData and gem.gemData.grantedEffect)
	end

	-- A gem's attribute ("str", "dex", "int", or "white" for none), from its granted effect's colour (1, 2, 3), so the
	-- page draws it in the theme's gem colours.
	local ATTR = { "str", "dex", "int" }
	local function attrOf(effect)
		return effect and ATTR[effect.color] or "white"
	end

	-- Gem `j`'s row of controls in the tab, as POB shows them: its numbers are the edit boxes' own text.
	local function slotControls(st, j)
		local slot = st.gemSlots[j]
		return {
			level = s.control(slot.level),
			quality = s.control(slot.quality),
			enabled = s.control(slot.enabled),
			count = s.control(slot.count),
			enableGlobal1 = s.control(slot.enableGlobal1),
			enableGlobal2 = s.control(slot.enableGlobal2),
			delete = s.control(slot.delete),
		}
	end

	local function readGem(st, gem, j)
		local effect = grantedEffect(gem)
		return {
			controls = slotControls(st, j),
			id = gem.gemData and gem.gemData.id or nil,
			name = (gem.gemData and gem.gemData.name) or (gem.grantedEffect and gem.grantedEffect.name) or gem.nameSpec or "",
			color = gem.color or "^8",
			attr = attrOf(effect),
			known = gem.gemData ~= nil or gem.grantedEffect ~= nil,
			enabled = gem.enabled and true or false,
			support = effect and effect.support and true or false,
			errMsg = gem.errMsg,
			tip = gem.gemData and tooltipLines(function(tip)
				gemTooltip.AddGemTooltip(tip, st.build, gem)
			end) or nil,
		}
	end

	local function sourceName(group)
		local src = group.sourceItem or group.sourceNode
		if src then
			return src.name
		elseif group.source == "Config" then
			return "Custom Modifiers"
		end
		return group.source
	end

	-- The skill sets, the active set's socket groups and the shown group's gems (with POB's tooltips).
	-- `{ group }` shows that group first.
	function ops.read(a)
		local b = s.build()
		local st = tab()
		local shown
		if a.group and st.socketGroupList[a.group] then
			display(a.group)
		end
		for i, group in ipairs(st.socketGroupList) do
			if group == st.displayGroup then
				shown = i
			end
		end
		if not shown and st.socketGroupList[1] then
			display(1)
			shown = 1
		end
		local sets = { }
		local activeSet = 1
		for index, id in ipairs(st.skillSetOrderList) do
			local set = st.skillSets[id]
			sets[index] = set and set.title or "Default"
			if id == st.activeSkillSetId then
				activeSet = index
			end
		end
		local groups = { }
		for i, group in ipairs(st.socketGroupList) do
			-- the group's first active skill gem, whose picture the list shows
			local active
			for _, gem in ipairs(group.gemList) do
				local effect = grantedEffect(gem)
				if effect and not effect.support and not active then
					active = (gem.gemData and gem.gemData.name) or effect.name
				end
			end
			groups[i] = {
				label = group.label or "",
				displayLabel = group.displayLabel or "",
				enabled = group.enabled and true or false,
				slotEnabled = group.slotEnabled ~= false,
				includeInFullDPS = group.includeInFullDPS and true or false,
				slot = group.slot,
				source = group.source and sourceName(group) or nil,
				activeGem = active,
				count = #group.gemList,
			}
		end
		local detail
		if shown then
			local group = st.socketGroupList[shown]
			local gems = { }
			st:UpdateGemSlots()
			for j, gem in ipairs(group.gemList) do
				gems[j] = readGem(st, gem, j)
			end
			local c = st.controls
			-- a group with no label: POB's SetText(nil) writes "nil" in the box
			local label = s.control(c.groupLabel)
			if label and group.label == nil then
				label.text = ""
			end
			detail = {
				index = shown,
				label = label,
				slot = s.control(c.groupSlot),
				enabled = s.control(c.groupEnabled),
				includeInFullDPS = s.control(c.includeInFullDPS),
				count = s.control(c.groupCount),
				sockets = s.control(c.socketsLabel),
				optimiseSockets = s.control(c.optimiseSockets),
				sourceNote = s.control(c.sourceNote),
				imbuedLabel = s.control(c.imbuedSupportLabel),
				imbued = s.control(c.imbuedSupport),
				imbuedClear = s.control(c.imbuedSupportClear),
				gems = gems,
			}
		end
		-- The tab's "Gem Options", each with the text of the label POB draws beside it
		local c = st.controls
		local function option(name, label)
			local out = s.control(c[name])
			if label and c[label] then
				out.label = s.control(c[label]).label
			end
			return out
		end
		return {
			options = {
				sortGemsByDPS = s.control(c.sortGemsByDPS),
				sortGemsByDPSField = option("sortGemsByDPSFieldControl"),
				defaultLevel = option("defaultLevel", "defaultLevelLabel"),
				defaultQuality = option("defaultQuality", "defaultQualityLabel"),
				showSupportGemTypes = option("showSupportGemTypes", "showSupportGemTypesLabel"),
				showLegacyGems = s.control(c.showLegacyGems),
			},
			sets = sets,
			activeSet = activeSet,
			main = b.mainSocketGroup,
			groups = groups,
			detail = detail or s.json.null,
		}
	end

	-- A gem selector of group `a.group`: the imbued support's (`a.imbued`), gem `a.gem`'s, or the empty one after the
	-- group's gems; its list built as when the user opens it (OnFocusGained), with POB's filters and order.
	local function selector(a)
		local st, group = display(a.group)
		local sel
		if a.imbued then
			sel = st.controls.imbuedSupport
		else
			assert(group.source == nil, "this group's gems cannot be changed")
			sel = gemSlot(st, group, a.gem or #group.gemList + 1).nameSpec
		end
		sel.dropped = true
		sel:UpdateSortCache()
		sel:BuildList("")
		sel.dropped = false
		return sel, st, group
	end

	-- The gems a gem selector offers (`{ group, imbued?, gem? }`), in its order (gems that can support the group's skills
	-- first): `{ id, name, attr, support, canSupport }`. POB's own filters (support gem types, legacy gems, character
	-- level) apply.
	function ops.gems(a)
		local sel = selector(a)
		local out = { }
		for _, key in ipairs(sel.list) do
			local gem = sel.gems[key]
			if gem then
				local effect = gem.grantedEffect
				out[#out + 1] = {
					id = gem.id,
					name = gem.name,
					attr = attrOf(effect),
					support = effect.support and true or false,
					canSupport = sel.sortCache and sel.sortCache.canSupport[key] and true or false,
				}
			end
		end
		return out
	end

	-- Chooses gem `id` in a gem selector (`{ group, id, imbued?, gem? }`), as a click on it in the selector's list does
	-- (GemSelectControl:OnKeyDown LEFTBUTTON).
	local function choose(a)
		local sel = selector(a)
		local found
		for index, key in ipairs(sel.list) do
			local gem = sel.gems[key]
			if gem and gem.id == a.id then
				found = index
			end
		end
		assert(found, "Path of Building does not offer this gem here")
		sel.initialBuf = sel.buf
		sel.selIndex = found
		sel:SetText(sel.gems[sel.list[found]].name)
		sel:UpdateGem(false, true)
		return { }
	end

	-- What hovering a gem in a selector's list shows (`{ group, id, imbued?, gem? }`): POB's gem tooltip and what
	-- choosing it would change, as GemSelectControl:Draw builds it.
	local function choiceTip(a)
		local sel, st = selector(a)
		local gemData
		for _, key in ipairs(sel.list) do
			local gem = sel.gems[key]
			if gem and gem.id == a.id then
				gemData = gem
			end
		end
		assert(gemData, "Path of Building does not offer this gem here")
		return tooltipLines(function(tip)
			local gemInstance = {
				level = st:ProcessGemLevel(gemData, sel.imbuedSelect),
				quality = st.defaultGemQuality or 0,
				qualityId = "Default",
				count = 1,
				enabled = true,
				enableGlobal1 = true,
				enableGlobal2 = true,
				gemId = gemData.id,
				nameSpec = gemData.name,
				skillId = gemData.grantedEffectId,
				gemData = gemData,
			}
			gemTooltip.AddGemTooltip(tip, st.build, gemInstance)
			local calcFunc, calcBase = st.build.calcsTab:GetMiscCalculator(st.build)
			if calcFunc then
				local output = sel:CalcOutputWithThisGem(calcFunc, gemData, st.sortGemsByDPSField == "FullDPS")
				tip:AddSeparator(10)
				st.build:AddStatComparesToTooltip(tip, calcBase, output, "^7Selecting this gem will give you:")
			end
		end)
	end

	-- POB's tooltip (`{ lines }`) for `{ what, group?, gem?, id?, imbued? }`:
	-- "group": the socket group's (SkillsTab:AddSocketGroupTooltip, as the list shows on hover);
	-- "choice": gem `id` in a gem selector, with what choosing it would change;
	-- "quality", "enabled", "count", "delete": gem `gem`'s control's (quality at 20, the gem on or off, compared);
	-- "optimiseSockets", "imbuedClear": the group's button's.
	function ops.tip(a)
		if a.what == "choice" then
			return { lines = choiceTip(a) }
		end
		local st, group = display(a.group)
		local c
		if a.what == "group" then
			return { lines = tooltipLines(function(tip)
				st:AddSocketGroupTooltip(tip, group)
			end) }
		elseif a.what == "optimiseSockets" then
			c = st.controls.optimiseSockets
		elseif a.what == "imbuedClear" then
			c = st.controls.imbuedSupportClear
		else
			c = gemSlot(st, group, a.gem)[a.what]
		end
		assert(c, "no such control")
		return { lines = tooltipLines(function(tip)
			if c.tooltipFunc then
				c.tooltipFunc(tip)
			elseif c.tooltipText then
				tip:AddLine(14, type(c.tooltipText) == "function" and c.tooltipText() or c.tooltipText)
			end
		end) }
	end

	-- Shows a group in the tab (`{ group }`).
	function ops.select(a)
		display(a.group)
		return { }
	end

	-- The group's label edit box (`{ group, text }`).
	function ops.setLabel(a)
		local st = display(a.group)
		s.act(st.controls.groupLabel, a.text or "")
		return { }
	end

	-- The group's "Socketed in" drop-down (`{ group, index }`, 1-based in its list).
	function ops.setSlot(a)
		local st = display(a.group)
		s.act(st.controls.groupSlot, a.index)
		return { }
	end

	-- The group's "Enabled" and "Include in Full DPS" check boxes (`{ group, on }`).
	function ops.setEnabled(a)
		local st = display(a.group)
		s.act(st.controls.groupEnabled, a.on)
		return { }
	end

	function ops.setFullDPS(a)
		local st = display(a.group)
		s.act(st.controls.includeInFullDPS, a.on)
		return { }
	end

	-- Makes a group the main skill, as a right click on it in POB's list does (SkillListControl:OnHoverKeyUp).
	function ops.setMain(a)
		local st = display(a.group)
		st.build.mainSocketGroup = a.group
		st:AddUndoState()
		st.build.buildFlag = true
		return { }
	end

	-- A gem's level, quality and count edit boxes and its enabled check box (`{ group, gem, value }`).
	function ops.setGemLevel(a)
		local st, group = display(a.group)
		s.act(gemSlot(st, group, a.gem).level, a.value)
		return { }
	end

	function ops.setGemQuality(a)
		local st, group = display(a.group)
		s.act(gemSlot(st, group, a.gem).quality, a.value)
		return { }
	end

	function ops.setGemCount(a)
		local st, group = display(a.group)
		s.act(gemSlot(st, group, a.gem).count, a.value)
		return { }
	end

	function ops.setGemEnabled(a)
		local st, group = display(a.group)
		s.act(gemSlot(st, group, a.gem).enabled, a.value)
		return { }
	end

	-- A gem's "x" button (`{ group, gem }`).
	function ops.removeGem(a)
		local st, group = display(a.group)
		local slot = gemSlot(st, group, a.gem)
		assert(a.gem <= #group.gemList and group.source == nil, "this gem cannot be removed")
		slot.delete.onClick()
		return { }
	end

	-- Puts gem `{ group, id, gem? }` in the group: in the empty slot after its gems, or in place of gem `gem`.
	function ops.setGem(a)
		return choose({ group = a.group, id = a.id, gem = a.gem })
	end

	-- The group's imbued support (`{ group, id }`), and its "x" button (`{ group }`).
	function ops.setImbued(a)
		return choose({ group = a.group, id = a.id, imbued = true })
	end

	function ops.clearImbued(a)
		local st = display(a.group)
		assert(st.controls.imbuedSupportClear:IsEnabled(), "the imbued support cannot be changed here")
		st.controls.imbuedSupportClear.onClick()
		return { }
	end

	-- A gem's "Enable <skill>:" check boxes of a Vaal gem (`{ group, gem, which = 1 | 2, value }`).
	function ops.setGemGlobal(a)
		local st, group = display(a.group)
		s.act(gemSlot(st, group, a.gem)["enableGlobal" .. a.which], a.value)
		return { }
	end

	-- The "Count:" edit box of a group an item or a passive grants (`{ group, value }`).
	function ops.setGroupCount(a)
		local st = display(a.group)
		s.act(st.controls.groupCount, a.value)
		return { }
	end

	-- The "Optimise Sockets" button (`{ group }`): rebuilds the group's item's sockets to match its groups.
	function ops.optimiseSockets(a)
		local st = display(a.group)
		local button = st.controls.optimiseSockets
		assert(button:IsShown() and button:IsEnabled(), "the sockets cannot be optimised")
		button.onClick()
		return { }
	end

	-- The list's "New" button: a new, empty group, shown.
	function ops.newGroup()
		local st = tab()
		st.controls.groupList.controls.new.onClick()
		return { group = #st.socketGroupList }
	end

	-- The list's "Delete" button on group `{ group }`, confirming POB's question.
	function ops.deleteGroup(a)
		local st, group = display(a.group)
		assert(group.source == nil, "This socket group cannot be deleted as it is created by an equipped item.")
		-- POB names the group in its question; a group not calculated yet has no name
		group.displayLabel = group.displayLabel or group.label or ""
		local popups = #main.popups
		st.controls.groupList:OnSelDelete(a.group, group)
		if #main.popups > popups then
			local popup = main.popups[1]
			assert(popup.controls and popup.controls.confirm, "Path of Building asked something unexpected")
			popup.controls.confirm.onClick()
		end
		return { }
	end

	-- One of the tab's "Gem Options" (`{ name, value }`).
	local OPTIONS = {
		sortGemsByDPS = true, sortGemsByDPSFieldControl = true, defaultLevel = true, defaultQuality = true,
		showSupportGemTypes = true, showLegacyGems = true,
	}
	function ops.setOption(a)
		assert(OPTIONS[a.name], "no such option")
		s.act(tab().controls[a.name], a.value)
		return { }
	end

	-- The "Skill set" drop-down (`{ index }`, 1-based), its list filled as the tab's Draw fills it.
	function ops.setSkillSet(a)
		local st = tab()
		local list = { }
		for index, id in ipairs(st.skillSetOrderList) do
			local set = st.skillSets[id]
			list[index] = set and set.title or "Default"
		end
		st.controls.setSelect:SetList(list)
		s.act(st.controls.setSelect, a.index)
		return { }
	end

	return ops
end
