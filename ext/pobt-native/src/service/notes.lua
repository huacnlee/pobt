-- The notes page's operations ("notes.<op>"), on the build POB holds. `s` is service.lua's shared table: s.build(),
-- s.control(c), s.act(c, value), s.at(path), s.json.
return function(s)
	local ops = { }

	local function tab()
		return assert(s.build().notesTab, "no notes tab")
	end

	-- The notes, with POB's colour codes (as NotesTab:Save writes them).
	function ops.read()
		local t = tab()
		t:SetShowColorCodes(false)
		return { text = t.controls.edit.buf }
	end

	-- Replaces the notes with `text`; the build counts as modified as NotesTab:Draw marks it.
	function ops.write(a)
		local t = tab()
		t:SetShowColorCodes(false)
		t.controls.edit:SetText(tostring(a.text or ""))
		t.modFlag = t.lastContent ~= t.controls.edit.buf
		return { }
	end

	return ops
end
