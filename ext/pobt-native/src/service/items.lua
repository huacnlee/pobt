-- The items page's operations ("items.<op>"), on the build POB holds. `s` is service.lua's shared table: s.build(),
-- s.control(c), s.act(c, value), s.at(path), s.json.
--
-- Everything is POB's Items tab (Classes/ItemsTab.lua, ItemSlotControl.lua): its item sets, its slot drop-downs and
-- flask check boxes (changed through s.act, so POB's own handlers run), its item list, and its item tooltip
-- (ItemsTab:AddItemTooltip, stat comparisons included), read line by line with POB's colour codes.
return function(s)
	local ops = { }

	local function tab()
		return assert(s.build().itemsTab, "Path of Building has no Items tab open")
	end

	-- ItemsTab:Draw fills the set drop-down's list each frame; with no window, do as it does before reading or acting.
	local function fillSetSelect(t)
		local list = { }
		for index, itemSetId in ipairs(t.itemSetOrderList) do
			list[#list + 1] = t.itemSets[itemSetId].title or "Default"
			if itemSetId == t.activeItemSetId then
				t.controls.setSelect.selIndex = index
			end
		end
		t.controls.setSelect:SetList(list)
	end

	local function itemInfo(item)
		return {
			id = item.id,
			name = item.name or item.title or "",
			title = item.title,
			base = item.baseName,
			rarity = item.rarity,
			type = item.type,
		}
	end

	-- A tooltip as POB fills it, read as lines: `{ text, size }`, or `{ sep = true }` for a rule. POB wraps lines to the
	-- tooltip's width as it adds them; the screens wrap for themselves (and translate whole lines), so the width POB
	-- sets is ignored here.
	local function tooltipLines(fill)
		local tip = new("Tooltip"):Tooltip()
		local view = setmetatable({ }, {
			__index = tip,
			__newindex = function(_, k, v)
				if k ~= "maxWidth" then
					tip[k] = v
				end
			end,
		})
		fill(view)
		local lines = { }
		for _, line in ipairs(tip.lines) do
			if line.text then
				lines[#lines + 1] = { text = line.text, size = line.size }
			else
				lines[#lines + 1] = { sep = true }
			end
		end
		return lines
	end

	-- The slots POB shows for the active set, in its order: weapons of the weapon set in use, abyssal sockets of what
	-- has them, the slots the tree or ascendancy adds, and the tree's allocated jewel sockets.
	local function slotList(t)
		t:UpdateSockets()
		local slots = { }
		for _, slot in ipairs(t.orderedSlots) do
			if slot:IsShown() then
				local c = s.control(slot)
				slots[#slots + 1] = {
					name = slot.slotName,
					label = slot.label,
					itemId = slot.selItemId or 0,
					flask = slot.controls.activate ~= nil,
					active = slot.active and true or false,
					jewel = slot.nodeId ~= nil,
					parent = slot.parentSlot and slot.parentSlot.slotName or nil,
					-- the drop-down's items: their names (POB's colour codes) and the item ids behind them, "None" first
					choices = c.items,
					ids = slot.items,
					sel = c.sel,
					enabled = c.enabled,
				}
			end
		end
		return slots
	end

	-- The slot EquipItemInSet would fill with `item` in the active set, if POB has that slot (jewels have none: they go
	-- in a socket of the tree).
	local function primarySlot(t, item)
		if not item.base then
			return nil
		end
		local ok, name = pcall(item.GetPrimarySlot, item)
		if not ok or not name or not t.slots[name] then
			return nil
		end
		if t.slots[name].weaponSet == 1 and t.activeItemSet.useSecondWeaponSet then
			name = name .. " Swap"
		end
		return t.slots[name] and name or nil
	end

	-- The Items tab as the page shows it: sets, slots, every item of the build.
	function ops.read()
		local t = tab()
		fillSetSelect(t)
		local items = { }
		for _, id in ipairs(t.itemOrderList) do
			local item = t.items[id]
			if item then
				local info = itemInfo(item)
				-- the slot POB's "equip" puts it in (EquipItemInSet: its primary slot, the swap one in the second weapon set)
				info.equipSlot = primarySlot(t, item)
				items[#items + 1] = info
			end
		end
		return {
			sets = s.control(t.controls.setSelect),
			-- the weapon set in use (POB's "Weapon Set: I / II" buttons)
			weaponSet = t.activeItemSet.useSecondWeaponSet and 2 or 1,
			slots = slotList(t),
			items = items,
		}
	end

	-- Picks the active item set by its 1-based place in POB's list, through POB's drop-down.
	function ops.setActiveSet(a)
		local t = tab()
		fillSetSelect(t)
		s.act(t.controls.setSelect, a.index)
		return { }
	end

	-- Uses weapon set 1 or 2, through POB's "Weapon Set: I / II" buttons (their handlers also move the main skill to a
	-- skill of that set).
	function ops.setWeaponSet(a)
		local t = tab()
		local button = tonumber(a.set) == 2 and t.controls.weaponSwap2 or t.controls.weaponSwap1
		button.onClick()
		return { }
	end

	-- Equips item `{ id }` as POB does when it is double-clicked in the item list (ItemsTab:EquipItemInSet, in the
	-- active set).
	function ops.equipItem(a)
		local t = tab()
		local item = assert(t.items[tonumber(a.id)], "no such item")
		assert(primarySlot(t, item), "Path of Building has no slot to equip this item in")
		t:EquipItemInSet(item, t.activeItemSetId)
		return { }
	end

	-- POB's tooltip of item `{ id }`; with `slot`, its comparison is against that slot as POB's slot drop-down shows it.
	function ops.tooltip(a)
		local t = tab()
		local item = assert(t.items[tonumber(a.id)], "no such item")
		local slot = a.slot and t.slots[a.slot] or nil
		return { lines = tooltipLines(function(tip)
			t:AddItemTooltip(tip, item, slot)
		end) }
	end

	-- What POB makes of pasted item text (ItemsTab's paste: CreateDisplayItemFromRaw, normalised): its tooltip, with
	-- what equipping it would give, and the slots it fits; `{ error }` when POB reads no item.
	function ops.parse(a)
		local t = tab()
		t:CreateDisplayItemFromRaw(tostring(a.text or ""):gsub("\r\n", "\n"), true)
		local item = t.displayItem
		if not item or not item.base then
			t:SetDisplayItem()
			return { error = "Path of Building does not recognise this item" }
		end
		local fits = { }
		for _, slot in ipairs(t.orderedSlots) do
			if slot:IsShown() and t:IsItemValidForSlot(item, slot.slotName) then
				fits[#fits + 1] = { name = slot.slotName, label = slot.label }
			end
		end
		return {
			item = itemInfo(item),
			fits = fits,
			lines = tooltipLines(function(tip)
				t:AddItemTooltip(tip, item)
			end),
		}
	end

	-- Adds the item `parse` read to the build, as POB's "Save" does (AddDisplayItem: equipped in a free slot it fits);
	-- with `slot`, equipped there instead, as dropping it on that slot does (ItemSlotControl:ReceiveDrag).
	function ops.add(a)
		local t = tab()
		local item = assert(t.displayItem, "no item to add")
		local slot = a.slot and t.slots[a.slot] or nil
		if slot and t:IsItemValidForSlot(item, slot.slotName) then
			t:AddDisplayItem(true)
			slot:SetSelItemId(item.id)
			t:PopulateSlots()
			t:AddUndoState()
			t.build.buildFlag = true
		else
			t:AddDisplayItem(false)
		end
		return { id = item.id }
	end

	-- Drops the item `parse` read.
	function ops.cancel()
		tab():SetDisplayItem()
		return { }
	end

	-- Crafting and custom items: POB's own popups (ItemsTab:CraftItem, EditDisplayItemText), opened by the Items tab's
	-- buttons and driven through their controls, so POB makes the item; it becomes POB's display item, which "Save"
	-- (AddDisplayItem) puts in the build.

	-- The popup POB has open: its title and its controls in the order POB lays them out (top to bottom, left to
	-- right), each named: lists, edit boxes, check boxes as s.control reads them, and buttons ({ kind = "button", label,
	-- enabled }), with POB's label beside each; nil when none is open.
	local function popupInfo()
		local popup = main.popups[1]
		if not popup then
			return nil
		end
		local controls = { }
		for name, c in pairs(popup.controls) do
			if type(name) == "string" and not name:match("Label$") then
				local shown = not c.IsShown or c:IsShown()
				local info
				if c.onClick then
					local label = type(c.label) == "function" and c.label() or c.label
					local enabled = c.enabled == nil or (type(c.enabled) == "function" and c.enabled()) or c.enabled == true
					info = { kind = "button", label = label, enabled = enabled and true or false }
				else
					info = s.control(c)
					if info and info.kind == "other" then
						info = nil
					end
				end
				if info then
					info.name = name
					info.shown = shown and true or false
					-- POB's label beside it ("Rarity:" for "rarity"), and whether POB has a tooltip for it (the item it
					-- would make)
					local label = popup.controls[name .. "Label"]
					info.caption = label and (type(label.label) == "function" and label.label() or label.label) or nil
					info.tip = c.tooltipFunc ~= nil
					-- where POB draws it, for the order of the fields
					local ok, x, y = pcall(c.GetPos, c)
					info.x, info.y = ok and x or 0, ok and y or 0
					controls[#controls + 1] = info
				end
			end
		end
		table.sort(controls, function(a, b)
			if a.y ~= b.y then
				return a.y < b.y
			end
			return a.x < b.x
		end)
		return { title = popup.title, controls = controls }
	end

	local function popupControl(name)
		local popup = assert(main.popups[1], "Path of Building has no window open")
		return assert(popup.controls[name], "no such control in Path of Building's window")
	end

	-- The display item (what is being crafted, pasted or edited), POB's tooltip of it, and the open popup.
	function ops.display()
		local t = tab()
		local item = t.displayItem
		local out = { popup = popupInfo() or s.json.null }
		if item and item.base then
			out.item = itemInfo(item)
			out.inBuild = (item.id and t.items[item.id]) and true or false
			out.lines = tooltipLines(function(tip)
				t:AddItemTooltip(tip, item)
			end)
		end
		return out
	end

	-- POB's "Craft item..." (a base of a type, at a rarity) and "Create custom..." (an item from its text); "edit"
	-- opens the display item's text, as POB's "Edit..." does.
	function ops.open(a)
		local t = tab()
		-- one window at a time, as POB shows them
		while main.popups[1] do
			main:ClosePopup()
		end
		if a.what == "craft" then
			t:CraftItem()
		elseif a.what == "edit" then
			assert(t.displayItem, "no item to edit")
			t:EditDisplayItemText()
		else
			t:SetDisplayItem()
			t:EditDisplayItemText()
		end
		return popupInfo()
	end

	-- Sets a control of the open popup (a list's 1-based index, an edit box's text), as the user would.
	function ops.popupSet(a)
		s.act(popupControl(a.name), a.value)
		return popupInfo() or s.json.null
	end

	-- Presses a button of the open popup ("save", "cancel"), when POB enables it.
	function ops.popupPress(a)
		local c = popupControl(a.name)
		local enabled = c.enabled == nil or (type(c.enabled) == "function" and c.enabled()) or c.enabled == true
		assert(enabled, "Path of Building does not allow that yet")
		c.onClick()
		return { popup = popupInfo() or s.json.null }
	end

	-- POB's tooltip of the open popup's control `name`: a list's entry `index` (the craft window's base, as POB shows
	-- the item it would make), or a button's (the text window's "Create": the item, or why it is not one).
	function ops.popupTip(a)
		local c = popupControl(a.name)
		assert(c.tooltipFunc, "no tooltip")
		return { lines = tooltipLines(function(tip)
			if a.index then
				local index = tonumber(a.index)
				c.tooltipFunc(tip, "HOVER", index, c.list[index])
			else
				c.tooltipFunc(tip)
			end
		end) }
	end

	-- Closes the open popup without its action (POB's "Cancel").
	function ops.popupClose()
		if main.popups[1] then
			main:ClosePopup()
		end
		return { }
	end

	-- Puts the display item in the build, as POB's "Save" / "Add to build" does (AddDisplayItem, equipped in a free
	-- slot it fits).
	function ops.saveDisplay()
		local t = tab()
		assert(t.displayItem, "no item to save")
		local item = t.displayItem
		t:AddDisplayItem()
		return { id = item.id }
	end

	return ops
end
