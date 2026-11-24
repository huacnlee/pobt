-- The config page's operations ("config.<op>"), on the build POB holds. `s` is service.lua's shared table: s.build(),
-- s.control(c), s.act(c, value), s.at(path), s.json.
--
-- The options are POB's own (Modules/ConfigOptions.lua) and so is every judgement on them: whether an option affects
-- the build is its control's `shown` (Classes/ConfigTab.lua, the conditions the calculation used), whether it is
-- modified and invalid is ConfigTab's own test, and its tooltip is what its control's tooltipFunc fills.
local varList = require("Modules.ConfigOptions")

return function(s)
	local ops = { }

	local function tab()
		return assert(s.build().configTab, "no config tab")
	end

	local function call(f, ...)
		if type(f) ~= "function" then
			return f
		end
		local ok, v = pcall(f, ...)
		return ok and v or nil
	end

	-- What a check box's tooltipFunc and default take differ from a list's or an edit box's.
	local function isCheck(c)
		return c._className == "CheckBoxControl"
	end

	-- The control's `shown`, with POB's "Show All Configurations" off or on (ConfigTab.lua toggleConfigs).
	local function shownWith(t, c, all)
		local keep = t.toggleConfigs
		t.toggleConfigs = all
		local v = call(c.shown, c)
		t.toggleConfigs = keep
		if c.shown == nil then
			return true
		end
		return v and true or false
	end

	-- What the user sees of the config tab: its sets and its sections, each option with its control, whether it
	-- affects the build (`shown`), shows under "Show All" (`shownAll`), differs from its default (`modified`) and is
	-- set although nothing in the build uses it (`invalid`, POB draws its label red).
	function ops.read()
		local t = tab()
		local inputs = t.configSets[t.activeConfigSetId].input
		local index = { }
		for i, c in ipairs(t.controls) do
			index[c] = i
		end
		local sections = { }
		local section, k = nil, 0
		local sectionNo = 0
		for _, varData in ipairs(varList) do
			if varData.section then
				sectionNo = sectionNo + 1
				local sc = t.sectionList[sectionNo]
				section = { name = varData.section, col = varData.col or (sc and sc.col) or 1, rows = { } }
				sections[#sections + 1] = section
				section.control = sc
				k = 0
			elseif section then
				k = k + 1
				local c = section.control and section.control.varControlList[k]
				if c and varData.label then
					local row = {
						var = varData.var,
						type = varData.type,
						label = varData.label,
						shown = shownWith(t, c, false),
						shownAll = shownWith(t, c, true),
					}
					if varData.var then
						local cur = inputs[varData.var]
						local def = t:GetDefaultState(varData.var, type(cur))
						row.modified = cur ~= nil and cur ~= def
						-- the label ConfigTab shows: red when the option is invalid
						local labelControl = c
						if varData.type ~= "check" then
							local prev = t.controls[(index[c] or 0) - 1]
							labelControl = prev and prev._className == "LabelControl" and prev or nil
						end
						local label = labelControl and call(labelControl.label, labelControl)
						row.invalid = type(label) == "string" and label:sub(1, #colorCodes.NEGATIVE) == colorCodes.NEGATIVE or false
						row.hideIfInvalid = varData.hideIfInvalid and true or nil
						row.control = s.control(c)
						row.control.shown = nil
						row.control.enabled = nil
						row.control.label = nil
					end
					section.rows[#section.rows + 1] = row
				end
			end
		end
		for _, sec in ipairs(sections) do
			sec.control = nil
		end
		local sets, active = { }, 1
		for i, id in ipairs(t.configSetOrderList) do
			sets[i] = t.configSets[id].title or "Default"
			if id == t.activeConfigSetId then
				active = i
			end
		end
		return { sets = sets, activeSet = active, sections = sections }
	end

	-- The tooltip of option `var` as POB shows it on hover, as `{ text, size }` lines (POB's colour codes) and `{ sep }`
	-- separators. For a list, `index` is the entry the pointer rests on (default: the selected one): another entry, or
	-- a check box, adds POB's comparison of what changing it would give.
	function ops.tooltip(a)
		local c = assert(tab().varControls[a.var], "no such option")
		local tt = new("Tooltip"):Tooltip()
		if c.tooltipFunc then
			if c.SetSel and c.list then
				local i = tonumber(a.index) or c.selIndex
				c.tooltipFunc(tt, a.index and "HOVER" or "BODY", i, c.list[i])
			elseif isCheck(c) then
				c.tooltipFunc(tt, c.state)
			else
				c.tooltipFunc(tt)
			end
		else
			local text = c:GetProperty("tooltipText")
			if text and text ~= "" then
				tt:AddLine(14, text)
			end
		end
		local lines = { }
		for _, line in ipairs(tt.lines) do
			if line.text then
				lines[#lines + 1] = { text = line.text, size = line.size }
			elseif #lines > 0 then
				lines[#lines + 1] = { sep = true }
			end
		end
		while #lines > 0 and lines[#lines].sep do
			lines[#lines] = nil
		end
		return { lines = lines }
	end

	-- Sets option `var` (`value`: a list's 1-based index, an edit box's text, a check box's state) through its control.
	function ops.set(a)
		s.act(assert(tab().varControls[a.var], "no such option"), a.value)
		return { }
	end

	-- Sets option `var` back to its default (ConfigTab:GetDefaultState), through its control.
	function ops.reset(a)
		local t = tab()
		local c = assert(t.varControls[a.var], "no such option")
		local def = t:GetDefaultState(a.var)
		if c.SetSel and c.list then
			for i, v in ipairs(c.list) do
				if type(v) == "table" and v.val == def then
					s.act(c, i)
					break
				end
			end
		elseif c.buf ~= nil and c.SetText then
			s.act(c, "")
		elseif isCheck(c) then
			s.act(c, def and true or false)
		end
		return { }
	end

	-- Switches to config set `index` (1-based, in the order POB lists them) through POB's set selector.
	function ops.selectSet(a)
		local t = tab()
		local sel = t.controls.setSelect
		-- the selector's list as ConfigTab:Draw fills it
		local list = { }
		for i, id in ipairs(t.configSetOrderList) do
			list[i] = t.configSets[id].title or "Default"
			if id == t.activeConfigSetId then
				sel.selIndex = i
			end
		end
		sel:SetList(list)
		s.act(sel, tonumber(a.index))
		return { }
	end

	return ops
end
