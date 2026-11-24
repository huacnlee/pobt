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

	return ops
end
