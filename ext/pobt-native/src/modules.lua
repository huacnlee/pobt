-- pobt: stand-ins for the native modules POB ships for Windows only, as much
-- of them as POB uses: lcurl (over a native HTTP request), lzip (reading a
-- file of a zip) and lua-utf8. Not luasocket, which only POB's
-- LaunchServer.lua takes.

local native = ...

-- Native modules built for another Lua cannot load into this one.
package.cpath = ""

-- POB's LuaJIT skips a first line starting with "#" (POB's "#@" header);
-- this one takes only "#!".
local loadfileLua = loadfile
function loadfile(name)
	local f = name and io.open(name, "rb")
	if not f then
		return loadfileLua(name)
	end
	local code = f:read("*a")
	f:close()
	if code:sub(1, 1) == "#" then
		code = "--" .. code
	end
	return loadstring(code, "@" .. name)
end

-- lcurl

local curl = setmetatable({ }, {
	-- OPT_URL -> "url", INFO_RESPONSE_CODE -> "info_response_code".
	__index = function(t, k)
		if type(k) == "string" and (k:match("^OPT_") or k:match("^INFO_")) then
			return k:gsub("^OPT_", ""):lower()
		end
	end,
})

local curlError = { }
curlError.__index = curlError
function curlError:msg() return self.message end
function curlError:no() return 1 end
function curlError:name() return "ERROR" end
curlError.__tostring = curlError.msg

local easy = { }

local function call(sink, data)
	if type(sink) == "function" then
		return sink(data)
	elseif sink then
		return sink:write(data)
	end
end

function easy:setopt(opt, value, ...)
	if type(opt) == "table" then
		for k, v in pairs(opt) do
			self:setopt(k, v)
		end
	else
		self.opts[opt] = value
	end
	return self
end

function easy:setopt_writefunction(f, ctx)
	self.write = ctx and function(data) return f(ctx, data) end or f
	return self
end

function easy:setopt_headerfunction(f, ctx)
	self.header = ctx and function(data) return f(ctx, data) end or f
	return self
end

function easy:escape(s)
	return (tostring(s):gsub("[^%w%-%._~]", function(c) return string.format("%%%02X", c:byte()) end))
end

function easy:unescape(s)
	return (tostring(s):gsub("%%(%x%x)", function(h) return string.char(tonumber(h, 16)) end))
end

function easy:perform()
	local o = self.opts
	local headers = type(o.httpheader) == "table" and table.concat(o.httpheader, "\n") or nil
	local body = o.postfields or (o.post and o.post ~= 0 and "") or nil
	local follow = o.followlocation and o.followlocation ~= 0 or false
	local code, head, data, redirect = native.Http(o.url or "", body, headers, o.useragent, o.proxy, follow)
	if not code then
		return nil, setmetatable({ message = head }, curlError)
	end
	self.info = { info_response_code = code, info_redirect_url = redirect, info_effective_url = o.url }
	local header, write = self.header or o.headerfunction, self.write or o.writefunction
	if header then
		for line in head:gmatch("[^\n]*\n") do
			call(header, line)
		end
	end
	if write and #data > 0 then
		call(write, data)
	end
	return self
end

function easy:getinfo(info)
	return self.info and self.info[info]
end

function easy:close() end

function easy:reset()
	self.opts, self.info, self.write, self.header = { }, nil, nil, nil
	return self
end

local easyMeta = {
	__index = function(self, k)
		if easy[k] then
			return easy[k]
		end
		-- setopt_url(v), setopt_useragent(v), ...; getinfo_response_code().
		local opt = type(k) == "string" and k:match("^setopt_(.+)")
		if opt then
			return function(self, v) return self:setopt(opt, v) end
		end
		local info = type(k) == "string" and k:match("^getinfo_(.+)")
		if info then
			return function(self) return self:getinfo("info_" .. info) end
		end
	end,
}

function curl.easy(opts)
	local e = setmetatable({ opts = { } }, easyMeta)
	if opts then
		e:setopt(opts)
	end
	return e
end

package.preload["lcurl.safe"] = function() return curl end
package.preload["lcurl"] = package.preload["lcurl.safe"]

-- lzip

local zipMeta = { }
zipMeta.__index = zipMeta

local zipFileMeta = { }
zipFileMeta.__index = zipFileMeta

function zipFileMeta:Read()
	return self.data
end

function zipFileMeta:Close() end

function zipMeta:OpenFile(name)
	local data = native.ZipRead(self.path, name)
	return data and setmetatable({ data = data }, zipFileMeta)
end

function zipMeta:Close() end

package.preload["lzip"] = function()
	return {
		open = function(path)
			local f = io.open(path, "rb")
			if not f then
				return nil
			end
			f:close()
			return setmetatable({ path = path }, zipMeta)
		end,
	}
end

-- lua-utf8: positions and counts in characters; %a and %w also take any
-- character beyond ASCII.

local utf8 = { charpattern = "[%z\1-\127\194-\244][\128-\191]*" }

local function isCont(s, i)
	local b = s:byte(i)
	return b and b >= 0x80 and b < 0xC0
end

-- The byte position of character `i` (negative from the end); #s + 1 past it.
local function bytePos(s, i)
	if i == 0 then
		return 1
	end
	if i > 0 then
		local p = 1
		for _ = 2, i do
			if p > #s then
				return #s + 1
			end
			p = p + 1
			while isCont(s, p) do p = p + 1 end
		end
		return p
	end
	local p = #s + 1
	for _ = 1, -i do
		if p <= 1 then
			return 0
		end
		p = p - 1
		while p > 1 and isCont(s, p) do p = p - 1 end
	end
	return p
end

-- The character at byte position `p`.
local function charIndex(s, p)
	local n = 0
	for i = 1, p do
		if not isCont(s, i) then
			n = n + 1
		end
	end
	return n
end

local function widen(pat)
	local out, inSet, i = { }, false, 1
	while i <= #pat do
		local c = pat:sub(i, i)
		if c == "%" then
			local k = pat:sub(i + 1, i + 1)
			if k == "a" or k == "w" then
				out[#out + 1] = inSet and ("%" .. k .. "\128-\255") or ("[%" .. k .. "\128-\255]")
			else
				out[#out + 1] = c .. k
			end
			i = i + 2
		else
			if c == "[" and not inSet then
				inSet = true
				out[#out + 1] = c
				-- "[]" and "[^]" take a literal "]".
				if pat:sub(i + 1, i + 1) == "^" then
					out[#out + 1] = "^"
					i = i + 1
				end
				if pat:sub(i + 1, i + 1) == "]" then
					out[#out + 1] = "]"
					i = i + 1
				end
			elseif c == "]" and inSet then
				inSet = false
				out[#out + 1] = c
			else
				out[#out + 1] = c
			end
			i = i + 1
		end
	end
	return table.concat(out)
end

function utf8.len(s, i, j)
	local a, b = bytePos(s, i or 1), j and bytePos(s, j) or #s
	local n = 0
	for p = a, b do
		if not isCont(s, p) then
			n = n + 1
		end
	end
	return n
end

function utf8.sub(s, i, j)
	j = j or -1
	local len = utf8.len(s)
	if i < 0 then i = math.max(len + i + 1, 1) elseif i == 0 then i = 1 end
	if j < 0 then j = len + j + 1 elseif j > len then j = len end
	if i > j then
		return ""
	end
	return s:sub(bytePos(s, i), bytePos(s, j + 1) - 1)
end

function utf8.reverse(s)
	local chars = { }
	for c in s:gmatch(utf8.charpattern) do
		table.insert(chars, 1, c)
	end
	return table.concat(chars)
end

function utf8.next(s, p, offset)
	offset = offset or 1
	if not p or p == 0 then
		p, offset = 1, offset - 1
	end
	if offset >= 0 then
		for _ = 1, offset do
			if p > #s then
				return nil
			end
			p = p + 1
			while isCont(s, p) do p = p + 1 end
		end
	else
		for _ = 1, -offset do
			p = p - 1
			while p > 1 and isCont(s, p) do p = p - 1 end
		end
	end
	if p < 1 or p > #s then
		return nil
	end
	return p, utf8.codepoint(s, p)
end

function utf8.codepoint(s, i, j)
	i = i or 1
	j = j or i
	local out = { }
	local p = i
	while p <= j and p <= #s do
		local c = s:byte(p)
		local n = c < 0x80 and 0 or c < 0xE0 and 1 or c < 0xF0 and 2 or 3
		local cp = n == 0 and c or (c % 2 ^ (6 - n))
		for k = 1, n do
			cp = cp * 64 + (s:byte(p + k) or 0x80) % 64
		end
		out[#out + 1] = cp
		p = p + n + 1
	end
	return unpack(out)
end

function utf8.char(...)
	local out = { }
	for _, cp in ipairs({ ... }) do
		if cp < 0x80 then
			out[#out + 1] = string.char(cp)
		elseif cp < 0x800 then
			out[#out + 1] = string.char(0xC0 + math.floor(cp / 64), 0x80 + cp % 64)
		elseif cp < 0x10000 then
			out[#out + 1] = string.char(0xE0 + math.floor(cp / 4096), 0x80 + math.floor(cp / 64) % 64, 0x80 + cp % 64)
		else
			out[#out + 1] = string.char(0xF0 + math.floor(cp / 262144), 0x80 + math.floor(cp / 4096) % 64,
				0x80 + math.floor(cp / 64) % 64, 0x80 + cp % 64)
		end
	end
	return table.concat(out)
end

function utf8.offset(s, n, i)
	if i then
		return bytePos(s:sub(i), n) + i - 1
	end
	return bytePos(s, n)
end

function utf8.find(s, pat, init, plain)
	local from = init and bytePos(s, init) or 1
	local r = { s:find(plain and pat or widen(pat), from, plain) }
	if not r[1] then
		return nil
	end
	r[1], r[2] = charIndex(s, r[1]), charIndex(s, r[2])
	return unpack(r)
end

function utf8.match(s, pat, init)
	return s:match(widen(pat), init and bytePos(s, init) or 1)
end

function utf8.gmatch(s, pat)
	return s:gmatch(widen(pat))
end

function utf8.gsub(s, pat, repl, n)
	return s:gsub(widen(pat), repl, n)
end

function utf8.codes(s)
	return function(_, p)
		return utf8.next(s, p)
	end, s, 0
end

utf8.byte = utf8.codepoint
utf8.upper = string.upper
utf8.lower = string.lower
utf8.rep = string.rep
utf8.format = string.format

package.preload["lua-utf8"] = function() return utf8 end
