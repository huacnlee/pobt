-- The tree page's operations ("tree.<op>"), on the build POB holds. `s` is service.lua's shared table: s.build(),
-- s.control(c), s.act(c, value), s.at(path), s.json.
--
-- The tree's shape comes from POB's own tree (Classes/PassiveTree.lua placed every node and built its connectors);
-- allocating, deallocating, choosing an ascendancy or a mastery effect does what PassiveTreeView's left click and
-- TreeTab's mastery popup do; the search is PassiveTreeView's own matching; a node's tooltip is
-- PassiveTreeView:AddNodeTooltip's, stat differences included.
return function(s)
	local ops = { }
	local pi = math.pi

	local TYPES = { Normal = 1, Notable = 2, Keystone = 3, Mastery = 4, Socket = 5, ClassStart = 6, AscendClassStart = 7 }

	local function spec()
		return assert(s.build().spec, "no passive tree")
	end

	local function round(v, k)
		k = k or 1
		return math.floor(v * k + 0.5) / k
	end

	-- The nodes PassiveTreeView draws and points at: placed, with artwork, not a proxy.
	local function shown(node)
		return node.x and node.y and node.group and not node.isProxy and not node.group.isProxy
	end

	-- Nodes as columns (JSON for a few thousand nodes stays small): id, position, type, drawn radius, pointer radius
	-- (PassiveTreeView's `rsq`), ascendancy (index into `asc`) and name.
	local function nodeColumns(list, ascIndex)
		local out = { id = { }, x = { }, y = { }, t = { }, r = { }, hit = { }, asc = { }, name = { } }
		for _, node in ipairs(list) do
			local i = #out.id + 1
			out.id[i] = node.id
			out.x[i] = round(node.x)
			out.y[i] = round(node.y)
			out.t[i] = TYPES[node.type] or 1
			out.r[i] = round((node.size or 0) / 2)
			out.hit[i] = round(math.sqrt(node.rsq or 0))
			out.asc[i] = node.ascendancyName and ascIndex(node.ascendancyName) or 0
			out.name[i] = node.dn or ""
		end
		return out
	end

	-- A connector as PassiveTree:BuildConnector lays it: an arc of the group's orbit when both nodes are on the same
	-- orbit of the same group (the shorter way round), else a straight line. `[a, b]`, or `[a, b, cx, cy, r, a0, sweep]`
	-- with the canvas angles (0 to the right, clockwise).
	local function edge(n1, n2, radii)
		if n1.g == n2.g and n1.o == n2.o and n1.angle and n2.angle and n1.group and (radii[n1.o + 1] or 0) > 0 then
			if n1.angle > n2.angle then
				n1, n2 = n2, n1
			end
			local arc = n2.angle - n1.angle
			if arc >= pi then
				n1, n2 = n2, n1
				arc = pi * 2 - arc
			end
			return { n1.id, n2.id, round(n1.group.x), round(n1.group.y), radii[n1.o + 1], round(n1.angle - pi / 2, 10000), round(arc, 10000) }
		end
		return { n1.id, n2.id }
	end

	local function edges(connectors, nodes, radii, out, seen)
		for _, c in pairs(connectors) do
			local a, b = c.nodeId1, c.nodeId2
			local key = math.min(a, b) .. ":" .. math.max(a, b)
			local n1, n2 = nodes[a], nodes[b]
			if not seen[key] and n1 and n2 and shown(n1) and shown(n2) then
				seen[key] = true
				out[#out + 1] = edge(n1, n2, radii)
			end
		end
		return out
	end

	-- The ascendancies the tree knows: `{ id, name, class }`, and a function giving an id's 1-based index.
	local function ascendancies(tree)
		local list, index = { }, { }
		local function at(id)
			if not index[id] then
				local entry = tree.ascendNameMap and tree.ascendNameMap[id]
				list[#list + 1] = {
					id = id,
					name = entry and entry.ascendClass and entry.ascendClass.name or id,
					class = entry and entry.class and entry.class.name or "",
				}
				index[id] = #list
			end
			return index[id]
		end
		return list, at
	end

	-- The tree of the active spec, once per tree version: its nodes, connectors, classes and bounds. Cluster jewel
	-- nodes change with the build: `read` gives them.
	function ops.geometry()
		local sp = spec()
		local tree = sp.tree
		local asc, ascIndex = ascendancies(tree)
		local list = { }
		for _, node in pairs(tree.nodes) do
			-- the nodes of the spec (PassiveSpec leaves out a cluster socket's inner sockets, `expansionJewel.parent`)
			local live = sp.nodes[node.id]
			if live and shown(live) then
				list[#list + 1] = live
			end
		end
		table.sort(list, function(a, b)
			return a.id < b.id
		end)
		local classes = { }
		for id, class in pairs(tree.classes) do
			local start = class.startNodeId and tree.nodes[class.startNodeId]
			classes[#classes + 1] = { id = id, name = class.name, x = start and round(start.x or 0), y = start and round(start.y or 0) }
		end
		local x0, y0, x1, y1 = math.huge, math.huge, -math.huge, -math.huge
		for _, node in ipairs(list) do
			x0, y0 = math.min(x0, node.x), math.min(y0, node.y)
			x1, y1 = math.max(x1, node.x), math.max(y1, node.y)
		end
		return {
			key = tostring(sp.treeVersion),
			nodes = nodeColumns(list, ascIndex),
			edges = edges(tree.connectors, sp.nodes, tree.orbitRadii, { }, { }),
			asc = asc,
			classes = classes,
			ring = tree.constants and tree.constants.PSSCentreInnerRadius or 130,
			-- PassiveTree's `size`: PassiveTreeView's scale is min(view width, height) / size × 1.2 ^ zoomLevel
			size = tree.size,
			bounds = { round(x0), round(y0), round(x1), round(y1) },
		}
	end

	-- The file each image handle of the tree was loaded from, as PassiveTree:LoadImage found it (POB's own files:
	-- TreeData/…), relative to POB's folder. With the host's `ImgUri` (the image a handle shows, converted to a file
	-- the screens load when POB's is not one), that is used instead.
	local function imageFiles(tree)
		local files = { }
		local function find(name)
			for _, p in ipairs({ "TreeData/" .. name, "TreeData/" .. tree.treeVersion .. "/" .. name }) do
				local f = io.open(p, "rb")
				if f then
					f:close()
					return p
				end
			end
		end
		for name, data in pairs(tree.assets) do
			if data.handle and not files[data.handle] then
				files[data.handle] = find(name .. ".png")
			end
		end
		local versionNum = treeVersions[tree.treeVersion] and treeVersions[tree.treeVersion].num or 0
		for spriteType, data in pairs(tree.skillSprites or { }) do
			local maxZoom
			if not tree.imageZoomLevels then
				maxZoom = data
			elseif versionNum >= 3.19 then
				maxZoom = data[0.3835] or data[1]
			else
				maxZoom = data[#data]
			end
			if maxZoom and maxZoom.filename then
				local file = maxZoom.filename:gsub("%?%x+$", "")
				if versionNum >= 3.16 then
					file = file:gsub(".*/", "")
				end
				local path = find(file)
				for name in pairs(maxZoom.coords or { }) do
					local sprite = tree.spriteMap[name] and tree.spriteMap[name][spriteType]
					if sprite and sprite.handle and not files[sprite.handle] then
						files[sprite.handle] = path
					end
					break
				end
			end
		end
		local ok, legion = pcall(require, "TreeData.legion.tree-legion")
		if ok and type(legion) == "table" then
			for _, data in ipairs(legion.treeAssets or { }) do
				for name in pairs(data.coords or { }) do
					local asset = tree.assets[name]
					if asset and asset.handle and not files[asset.handle] then
						files[asset.handle] = "TreeData/legion/" .. data.filename
					end
					break
				end
			end
			for spriteType, data in pairs(legion) do
				local maxZoom = spriteType ~= "treeAssets" and data[#data]
				if maxZoom and maxZoom.filename then
					for name in pairs(maxZoom.coords or { }) do
						local sprite = tree.spriteMap[name] and tree.spriteMap[name][spriteType]
						if sprite and sprite.handle and not files[sprite.handle] then
							files[sprite.handle] = "TreeData/legion/" .. maxZoom.filename
						end
						break
					end
				end
			end
		end
		return files
	end

	-- The art of the active spec's tree, as PassiveTreeView:Draw picks it: the background, the class art, group
	-- backgrounds and each node's artwork in each state. Images are `{ path, w, h }` (relative to `root`, POB's folder);
	-- sprites `[image, u0, v0, u1, v1, w, h]` (the part of the image, as fractions, and its size in POB's art pixels:
	-- PassiveTreeView:DrawAsset draws it `w × 2.66` tree units wide). Nodes are columns of sprite numbers (0: none).
	function ops.art()
		local sp = spec()
		local tree = sp.tree
		local versionNum = treeVersions[tree.treeVersion] and treeVersions[tree.treeVersion].num or 0
		local files = imageFiles(tree)
		local uriOf = __sg and __sg.ImgUri
		local root = (GetScriptPath()):gsub("\\", "/"):gsub("/$", "")
		local images, imageIndex = { }, { }
		local sprites, spriteIndex = { }, { }
		-- an image handle (`layer`: a texture array's, 0-based) as a number; POB's own file where it is one the
		-- screens load, else the host's file for it (a DDS layer, converted)
		local function image(handle, layer)
			local byLayer = imageIndex[handle]
			if not byLayer then
				byLayer = { }
				imageIndex[handle] = byLayer
			end
			local k = layer or 0
			if byLayer[k] == nil then
				local path, w, h, absolute = not layer and files[handle], 0, 0, nil
				if path and handle.ImageSize then
					w, h = handle:ImageSize()
				elseif uriOf and handle.id then
					path, w, h = uriOf(handle.id, k)
					absolute = true
				end
				if path and (w or 0) > 0 then
					images[#images + 1] = { path = path, w = w, h = h, absolute = absolute }
					byLayer[k] = #images
				else
					byLayer[k] = false
				end
			end
			return byLayer[k]
		end
		-- a sprite (an asset of `tree.assets`, or an entry of `tree.spriteMap`) as a number
		local function sprite(data)
			if type(data) == "string" then
				data = tree.assets[data]
			end
			if not data or not data.handle then
				return 0
			end
			if spriteIndex[data] == nil then
				local img = image(data.handle)
				local w, h = data.width or 0, data.height or 0
				if img and w == 0 then
					w, h = images[img].w, images[img].h
				end
				if img and w > 0 then
					sprites[#sprites + 1] = { img, data[1] or 0, data[2] or 0, data[3] or 1, data[4] or 1, w, h }
					spriteIndex[data] = #sprites
				else
					spriteIndex[data] = 0
				end
			end
			return spriteIndex[data]
		end

		-- PoE2's tree (its PassiveTree's `ddsCoords`): its art is texture arrays, a picture being a layer, drawn at the
		-- size PassiveTreeView gives it (the node's `targetSize`, a class's background size), `width` each side of the
		-- centre: DrawAsset's scale is 1 (`scaleImage`), not 1.33. The icons have a dimmed copy (skills-disabled) for
		-- nodes not allocated, as POB dims them.
		local poe2 = tree.ddsCoords and next(tree.ddsCoords) ~= nil
		local art2
		if poe2 then
			local handles, byName = { }, { }
			for file, names in pairs(tree.ddsCoords) do
				local off = file:match("^skills%-disabled") and "off" or "on"
				for name, layer in pairs(names) do
					local e = byName[name] or { }
					byName[name] = e
					if not e[off] or file < e[off][1] then
						e[off] = { file, layer }
					end
				end
			end
			local function handle(file)
				if handles[file] == nil then
					local h = NewImageHandle()
					h:Load("TreeData/" .. tree.treeVersion .. "/" .. file, "CLAMP")
					handles[file] = h
				end
				return handles[file]
			end
			for _, data in pairs(tree.assets) do
				if type(data[1]) == "string" and data.handle and not files[data.handle] then
					files[data.handle] = "TreeData/" .. tree.treeVersion .. "/" .. data[1]
				end
			end
			-- layer `index` (0-based) of a texture array: its image, its part (fractions) and size; a cell of the
			-- host's pages of the array's layers (ImgAtlas), so the canvas loads a few files rather than one a layer
			local atlasOf = __sg and __sg.ImgAtlas
			local atlases = { }
			local function layer(h, index)
				local a = atlases[h]
				if a == nil then
					local json = atlasOf and h.id and atlasOf(h.id)
					a = json and s.json.decode(json) or false
					if a then
						a.images = { }
					end
					atlases[h] = a
				end
				local c = a and a.cells[index + 1]
				if c then
					local p = a.pages[c[1]]
					if not a.images[c[1]] then
						images[#images + 1] = { path = p.uri, w = p.w, h = p.h, absolute = true }
						a.images[c[1]] = #images
					end
					return a.images[c[1]], c[2] / p.w, c[3] / p.h, (c[2] + c[4]) / p.w, (c[3] + c[5]) / p.h, c[4], c[5]
				end
				local img = image(h, index)
				if img then
					return img, 0, 0, 1, 1, images[img].w, images[img].h
				end
			end
			local made = { }
			-- the picture named `name` (a ddsMap, assets or spriteMap name), `w` × `h` each side of its centre (its own
			-- size when not given); `off`: the dimmed one where there is one. A sprite number, 0 for none.
			art2 = function(name, w, h, off)
				if not name then
					return 0
				end
				local key = name .. "|" .. tostring(w) .. "|" .. tostring(h) .. "|" .. tostring(off)
				if made[key] then
					return made[key]
				end
				local out = 0
				local e = byName[name]
				local asset = not e and (tree.assets[name] or tree.spriteMap and tree.spriteMap[name])
				if e then
					local at = off and e.off or e.on or e.off
					local img, u0, v0, u1, v1, lw, lh = layer(handle(at[1]), at[2] - 1)
					if img then
						sprites[#sprites + 1] = { img, u0, v0, u1, v1, w or lw, h or lh }
						out = #sprites
					end
				elseif asset and asset.handle then
					local img = image(asset.handle)
					if img then
						local uv = type(asset[1]) == "number" and asset or { 0, 0, 1, 1 }
						sprites[#sprites + 1] = { img, uv[1], uv[2], uv[3], uv[4], w or asset.width or images[img].w, h or asset.height or images[img].h }
						out = #sprites
					end
				end
				made[key] = out
				return out
			end
		end

		-- nodes: their artwork when allocated, when a click's path, unallocated, and hovered (PassiveTreeView:Draw)
		local cols = { id = { }, baseOn = { }, basePath = { }, baseOff = { }, baseHover = { }, frameOn = { }, framePath = { }, frameOff = { }, effect = { }, under = { } }
		local list = { }
		for _, node in pairs(sp.nodes) do
			if shown(node) then
				list[#list + 1] = node
			end
		end
		table.sort(list, function(a, b)
			return a.id < b.id
		end)
		local function frame(node, state)
			if node.type == "ClassStart" then
				return sprite(state == "alloc" and node.startArt or "PSStartNodeBackgroundInactive")
			elseif node.type == "AscendClassStart" then
				local name = versionNum >= 3.10 and "AscendancyMiddle" or "PassiveSkillScreenAscendancyMiddle"
				local prefix = node.ascendancyName and tree.bloodlineSpritePrefixes and tree.bloodlineSpritePrefixes[node.ascendancyName]
				return sprite(prefix and tree.assets[prefix .. name] and prefix .. name or name)
			elseif node.type == "Socket" or node.type == "Mastery" or not node.overlay then
				return 0
			end
			local name = node.overlay[state .. (node.ascendancyName and "Ascend" or "") .. (node.isBlighted and "Blighted" or "")]
			if name and node.ascendancyName then
				local prefix = node.bloodlineOverlayPrefix or (tree.bloodlineSpritePrefixes and tree.bloodlineSpritePrefixes[node.ascendancyName])
				if prefix and tree.assets[prefix .. name] then
					name = prefix .. name
				end
			end
			return name and sprite(name) or 0
		end
		local function base(node, state)
			if node.type == "Socket" then
				local key = node.overlay and node.overlay[state .. (node.expansionJewel and "Alt" or "")]
				return key and sprite((node.name == "Charm Socket" and "Azmeri" or "") .. key) or 0
			elseif node.type == "Mastery" then
				if node.masteryEffects then
					local m = node.masterySprites or { }
					if state == "alloc" then
						return sprite(m.activeIcon and m.activeIcon.masteryActiveSelected)
					elseif state == "hover" then
						return sprite(m.inactiveIcon and m.inactiveIcon.masteryConnected)
					end
					return sprite(m.inactiveIcon and m.inactiveIcon.masteryInactive)
				end
				return sprite(node.sprites and node.sprites.mastery)
			elseif node.type == "ClassStart" or node.type == "AscendClassStart" or not node.sprites then
				return 0
			end
			return sprite(node.sprites[node.type:lower() .. (state == "alloc" and "Active" or "Inactive")])
		end
		-- PoE2's nodes (PassiveTreeView:Draw): a socket's frame is its base; a node's icon (dimmed while not
		-- allocated, also hovered) under its frame (`overlay`); an ascendancy's start only its middle; a notable's
		-- effect art, lit when allocated. Group centre art (OnlyImage), drawn faintly by POB, is left out.
		local function node2(i, node)
			local ts = node.targetSize or { }
			local ov = ts.overlay or { }
			local fx = ts.effect or { }
			local function frame2(state)
				return art2(node.overlay and node.overlay[state], ov.width, ov.height)
			end
			cols.under[i] = 0
			cols.effect[i] = 0
			cols.baseOn[i], cols.basePath[i], cols.baseOff[i], cols.baseHover[i] = 0, 0, 0, 0
			cols.frameOn[i], cols.framePath[i], cols.frameOff[i] = 0, 0, 0
			if node.type == "ClassStart" or node.type == "OnlyImage" then
				return
			elseif node.type == "AscendClassStart" then
				local name = "AscendancyMiddle"
				if node.ascendancyName and tree.secondaryAscendNameMap and tree.secondaryAscendNameMap[node.ascendancyName] then
					name = "Azmeri" .. name
				end
				local s = art2(name, ov.width, ov.height)
				cols.frameOn[i], cols.framePath[i], cols.frameOff[i] = s, s, s
			elseif node.type == "Socket" or node.containJewelSocket then
				local function socket(state)
					return art2(node.overlay and node.overlay[state], ts.width, ts.height)
				end
				cols.baseOn[i], cols.basePath[i], cols.baseOff[i] = socket("alloc"), socket("path"), socket("unalloc")
				cols.baseHover[i] = cols.baseOn[i]
			else
				cols.baseOn[i] = art2(node.icon, ts.width, ts.height)
				cols.baseOff[i] = art2(node.icon, ts.width, ts.height, true)
				cols.basePath[i], cols.baseHover[i] = cols.baseOff[i], cols.baseOff[i]
				cols.frameOn[i], cols.framePath[i], cols.frameOff[i] = frame2("alloc"), frame2("path"), frame2("unalloc")
				if node.activeEffectImage then
					cols.effect[i] = -art2(node.activeEffectImage, fx.width, fx.height)
				end
			end
		end
		for _, node in ipairs(list) do
			local i = #cols.id + 1
			cols.id[i] = node.id
			if poe2 then
				node2(i, node)
			else
				cols.baseOn[i] = base(node, "alloc")
				cols.basePath[i] = base(node, "path")
				cols.baseOff[i] = base(node, "unalloc")
				-- hovered: POB draws the node as allocated, but a node's icon by its allocation; a mastery "connected"
				cols.baseHover[i] = (node.type == "Socket" and base(node, "alloc")) or (node.type == "Mastery" and base(node, "hover")) or base(node, "unalloc")
				-- masteries and effects are drawn on layer 15, under the connectors (20); other nodes on 25
				cols.under[i] = node.type == "Mastery" and 1 or 0
				cols.frameOn[i] = frame(node, "alloc")
				cols.framePath[i] = frame(node, "path")
				cols.frameOff[i] = frame(node, "unalloc")
				-- the effect art: a mastery's when allocated (negative: only then), a tattoo's always
				local effect = 0
				if node.type == "Mastery" and node.masteryEffects and node.masterySprites and node.masterySprites.activeEffectImage then
					effect = -sprite(node.masterySprites.activeEffectImage.masteryActiveEffect)
				elseif node.isTattoo and node.effectSprites then
					effect = sprite(node.effectSprites.tattooActiveEffect)
				end
				cols.effect[i] = effect
			end
		end

		-- group backgrounds (renderGroup): an ascendancy's art, or the group's by its largest orbit (3: a half,
		-- mirrored below); cluster jewel groups take the Alt art
		local groups = { }
		local asc, ascIndex = ascendancies(tree)
		local function group(g, expansion)
			local s, half = 0, false
			if g.ascendancyName then
				if g.isAscendancyStart then
					s = sprite("Classes" .. g.ascendancyName)
				end
			elseif g.oo and g.oo[3] then
				s, half = sprite(expansion and "GroupBackgroundLargeHalfAlt" or "PSGroupBackground3"), true
			elseif g.oo and g.oo[2] then
				s = sprite(expansion and "GroupBackgroundMediumAlt" or "PSGroupBackground2")
			elseif g.oo and g.oo[1] then
				s = sprite(expansion and "GroupBackgroundSmallAlt" or "PSGroupBackground1")
			end
			if s > 0 and g.x and g.y then
				groups[#groups + 1] = { round(g.x), round(g.y), s, half and 1 or 0, g.ascendancyName and ascIndex(g.ascendancyName) or 0 }
			end
		end
		local scale2 = tree.scaleImage or 1
		if poe2 then
			-- PoE2: the ascendancies' backgrounds (the one an alternate replaces only), then each group's own
			local names = { }
			for name, data in pairs(tree.ascendNameMap or { }) do
				local a = data.ascendClass
				if a and a.background and not a.replace then
					names[#names + 1] = name
				end
			end
			table.sort(names)
			for _, name in ipairs(names) do
				local bg = tree.ascendNameMap[name].ascendClass.background
				local sprite2 = art2(bg.image, bg.width, bg.height)
				if sprite2 > 0 then
					groups[#groups + 1] = { round(bg.x * scale2), round(bg.y * scale2), sprite2, 0, ascIndex(name) }
				end
			end
			for _, g in pairs(tree.groups) do
				local bg = g.background
				if not g.isProxy and bg and g.x and g.y then
					local x, y = g.x * scale2, g.y * scale2
					if bg.offsetX and bg.offsetY then
						x, y = g.x + bg.offsetX, g.y + bg.offsetY
					end
					local sprite2 = art2(bg.image)
					if sprite2 > 0 then
						groups[#groups + 1] = { round(x), round(y), sprite2, bg.isHalfImage ~= nil and 1 or 0, 0 }
					end
				end
			end
		else
			for _, g in pairs(tree.groups) do
				if not g.isProxy then
					group(g)
				end
			end
			for _, sub in pairs(sp.subGraphs or { }) do
				group(sub.group, true)
			end
		end

		-- the class background art, where PassiveTreeView:Draw places it for each class
		local classArt = { }
		-- PoE2: `[classId, sprite, x, y, ascendancy, angle]`: the class's background ("*": unless one of its
		-- ascendancies' is drawn), an ascendancy's in its place, the lit ring turned towards the class's start, and the
		-- tree centre over them
		for id, class in pairs(poe2 and tree.classes or { }) do
			local bg = class.background
			if bg then
				local x, y = bg.x * scale2, bg.y * scale2
				local function add(sprite2, ascendancy, px, py, angle)
					if sprite2 > 0 then
						classArt[#classArt + 1] = { id, sprite2, round(px or x, 10), round(py or y, 10), ascendancy or "", angle and round(angle, 10000) or nil }
					end
				end
				add(art2(bg.image, bg.width, bg.height), "*")
				for _, a in pairs(class.classes or { }) do
					if a.background and a.background.image then
						add(art2(a.background.image, bg.width, bg.height), a.id or a.name)
					end
				end
				local start = sp.nodes[class.startNodeId] or tree.nodes[class.startNodeId]
				if bg.active and start then
					-- DrawQuadAndRotate turns the quad about (y, y), then moves it back by (x, y)
					local angle = pi / 2 + math.atan2(start.y - y, start.x - x)
					local d = x - y
					add(art2("BGTreeActive", bg.active.width, bg.active.height), "", x + d * math.cos(angle), y + d * math.sin(angle), angle)
				end
				if bg.bg then
					add(art2("BGTree", bg.bg.width, bg.bg.height), "")
				end
			end
		end
		for id, at in pairs(poe2 and { } or { [1] = { "BackgroundStr", -2750, 1600 }, [2] = { "BackgroundDex", 2550, 1600 }, [3] = { "BackgroundInt", -250, -2200 },
			[4] = { "BackgroundStrDex", -150, 2350 }, [5] = { "BackgroundStrInt", -2100, -1500 }, [6] = { "BackgroundDexInt", 2350, -1950 } }) do
			local s = sprite(at[1])
			if s > 0 then
				classArt[#classArt + 1] = { id, s, at[2], at[3] }
			end
		end

		-- connectors, as PassiveTreeView's renderConnector draws them (DrawImageQuad of `connector.type .. state` on
		-- the quad of PassiveTree:BuildConnector / BuildArc). Each quad maps its texture affinely: texture (u, v) is at
		-- origin + u·U + v·V. A line repeats its texture `t` times along U; an arc shows the part of its texture
		-- inside the kite (centre, origin + V·t, origin, origin + U·t). `[a, b, kind, Normal…, Active…]`, kind 0 a
		-- line (one quad for every state), n an arc of orbit n (Normal and Intermediate share a quad, Active has its
		-- own: its art is larger); a quad is `ox, oy, ux, uy, vx, vy, t`.
		local function quad(c, v)
			local function r(x)
				return round(x, 10)
			end
			if c.type == "LineConnector" then
				local t = c.c[13]
				return { r(v[3]), r(v[4]), r((v[5] - v[3]) / t), r((v[6] - v[4]) / t), r(v[1] - v[3]), r(v[2] - v[4]), round(t, 10000) }
			end
			local p = c.c[15]
			return { r(v[5]), r(v[6]), r((v[7] - v[5]) / p), r((v[8] - v[6]) / p), r((v[3] - v[5]) / p), r((v[4] - v[6]) / p), round(p, 10000) }
		end
		local conn = { }
		-- PoE2's connector art sets (Character, CharacterAscendancy, CharacterPlanned…), 0-based in order seen
		local sets, setIndex = { }, { }
		local function artSet(prefix)
			if not setIndex[prefix] then
				sets[#sets + 1] = prefix
				setIndex[prefix] = #sets - 1
			end
			return setIndex[prefix]
		end
		local function connector(c)
			local n1, n2 = sp.nodes[c.nodeId1], sp.nodes[c.nodeId2]
			if not (n1 and n2 and shown(n1) and shown(n2) and c.vert and c.c) then
				return
			end
			local out = { c.nodeId1, c.nodeId2, c.type == "LineConnector" and 0 or tonumber(c.type:match("^Orbit(%d+)$")) or 0 }
			if out[3] == 0 and c.type ~= "LineConnector" then
				return
			end
			for _, v in ipairs(quad(c, c.vert.Normal)) do
				out[#out + 1] = v
			end
			if out[3] > 0 then
				for _, v in ipairs(quad(c, c.vert.Active)) do
					out[#out + 1] = v
				end
			end
			-- PoE2: the connector's art set (its connectionArt), after the quads
			if poe2 then
				out[#out + 1] = artSet(c.connectionArt or "")
			end
			conn[#conn + 1] = out
		end
		for _, c in pairs(tree.connectors) do
			connector(c)
		end
		for _, sub in pairs(sp.subGraphs or { }) do
			for _, c in pairs(sub.connectors or { }) do
				connector(c)
			end
		end
		table.sort(conn, function(a, b)
			return a[1] < b[1] or a[1] == b[1] and (a[2] < b[2] or a[2] == b[2] and a[4] < b[4])
		end)
		-- the connector art by kind (0: LineConnector, n: Orbit n) and state
		local connArt = { }
		-- PoE2: set k's kinds at k × 10 + kind, every one of them given
		for k, prefix in ipairs(sets) do
			for kind = 0, 9 do
				local name = prefix .. (kind == 0 and "LineConnector" or "Orbit" .. kind)
				connArt[(k - 1) * 10 + kind + 1] = { art2(name .. "Normal"), art2(name .. "Intermediate"), art2(name .. "Active") }
			end
		end
		for kind = 0, poe2 and -1 or 9 do
			local name = kind == 0 and "LineConnector" or "Orbit" .. kind
			if tree.assets[name .. "Normal"] then
				connArt[kind + 1] = { sprite(name .. "Normal"), sprite(name .. "Intermediate"), sprite(name .. "Active") }
			end
		end

		-- art drawn by what the build holds (`read` names it): the art of a socketed jewel
		-- (PassiveTreeView:GetJewelSocketOverlay) and a jewel's radius rings
		local named = { }
		for _, name in ipairs({ "JewelSocketActiveRed", "JewelSocketActiveGreen", "JewelSocketActiveBlue", "JewelSocketActivePrismatic",
			"JewelSocketActiveAbyss", "JewelSocketActiveLegion", "JewelSocketActiveBlightcore", "JewelSocketActiveAltPurple",
			"JewelSocketActiveAltBlue", "JewelSocketActiveAltRed", "CharmSocketActiveStr", "CharmSocketActiveInt", "CharmSocketActiveDex" }) do
			for _, n in ipairs({ name, name .. "Alt" }) do
				if tree.assets[n] then
					named[n] = sprite(n)
				end
			end
		end
		-- PoE2: a socketed jewel's art (its unique's title or its base), at the size a socket draws it
		if poe2 then
			local ov = tree.GetNodeTargetSize and (tree:GetNodeTargetSize({ type = "Socket" }) or { }).overlay or { }
			for file, names in pairs(tree.ddsCoords) do
				if file:match("^jewel%-sockets") then
					for name in pairs(names) do
						named[name] = art2(name, ov.width, ov.height)
					end
				end
			end
		end
		local viewer = s.build().treeTab.viewer
		local ringFiles = { ring = "Assets/ring.png", jewelShadedOuterRing = "Assets/ShadedOuterRing.png",
			jewelShadedOuterRingFlipped = "Assets/ShadedOuterRingFlipped.png", jewelShadedInnerRing = "Assets/ShadedInnerRing.png",
			jewelShadedInnerRingFlipped = "Assets/ShadedInnerRingFlipped.png" }
		for _, pair in ipairs({ { "eternal", "EternalEmpire" }, { "karui", "Karui" }, { "maraketh", "Maraketh" }, { "templar", "Templar" },
			{ "vaal", "Vaal" }, { "kalguur", "Kalguuran" } }) do
			ringFiles[pair[1] .. "1"] = "TreeData/PassiveSkillScreen" .. pair[2] .. "JewelCircle1.png"
			ringFiles[pair[1] .. "2"] = "TreeData/PassiveSkillScreen" .. pair[2] .. "JewelCircle2.png"
		end
		for key, path in pairs(ringFiles) do
			local handle = viewer[key]
			if handle then
				files[handle] = files[handle] or path
				named[key] = sprite({ handle = handle })
			end
		end
		-- the radii a socket shows when hovered (build.data.jewelRadius): `[outer, inner, colour]`, POB's colour code
		local radii = { }
		for _, r in ipairs(s.build().data.jewelRadius or { }) do
			radii[#radii + 1] = { r.outer, r.inner, r.col }
		end

		local extra = { }
		for _, sub in pairs(sp.subGraphs or { }) do
			for _, node in ipairs(sub.nodes or { }) do
				extra[#extra + 1] = node.id
			end
		end
		table.sort(extra)
		return {
			connectors = conn,
			connArt = connArt,
			named = named,
			radii = radii,
			key = tostring(sp.treeVersion) .. ":" .. table.concat(extra, ","),
			root = root,
			images = images,
			sprites = sprites,
			background = poe2 and art2("Background2") or sprite(tree.assets.Background2 or tree.assets.Background1),
			-- DrawAsset's scale of a sprite's size (art pixels to tree units, each side of the centre): PoE2's 1
			artScale = poe2 and (tree.scaleImage or 1) or nil,
			classArt = classArt,
			classId = sp.curClassId,
			groups = groups,
			asc = asc,
			nodes = cols,
		}
	end

	-- PassiveTreeView's prepSearch: quoted phrases, then words, lower case.
	local function searchParams(text)
		local search = tostring(text or ""):lower()
		local words = { }
		for phrase in search:gmatch('"([^"]*)"') do
			words[#words + 1] = phrase
			search = search:gsub('"' .. phrase:gsub("([%(%)%%%.%[%]%*%+%-%?%^%$])", "%%%1") .. '"', "")
		end
		for word in search:gmatch("(%S*)") do
			if word:match("%S") then
				words[#words + 1] = word
			end
		end
		return words
	end

	local function matches(text)
		local viewer = s.build().treeTab.viewer
		local params = searchParams(text)
		local out = { }
		if #params == 0 then
			return out
		end
		local saved = viewer.searchParams
		viewer.searchParams = params
		-- PoE2's POB asks for the build first: DoesNodeMatchSearchParams(build, node)
		local withBuild = debug.getinfo(viewer.DoesNodeMatchSearchParams, "u").nparams >= 3
		local b = s.build()
		for id, node in pairs(spec().nodes) do
			local match
			if withBuild then
				match = shown(node) and viewer:DoesNodeMatchSearchParams(b, node)
			else
				match = shown(node) and viewer:DoesNodeMatchSearchParams(node)
			end
			if match then
				out[#out + 1] = id
			end
		end
		viewer.searchParams = saved
		table.sort(out)
		return out
	end

	-- The spec list as TreeTab:Draw fills its drop-down (without "Manage trees...").
	local function specControl()
		local tt = s.build().treeTab
		local c = tt.controls.specSelect
		c.selIndex = tt.activeSpec
		c:SetList(tt:GetSpecList())
		return s.control(c)
	end

	local function keys(t)
		local out = { }
		for id in pairs(t or { }) do
			out[#out + 1] = id
		end
		table.sort(out)
		return out
	end

	-- TreeTab's tree version line: shown (TreeTab's `showConvert`) when the active spec's tree is not the latest
	-- version, with POB's text and its two buttons' labels (POB's own, colour codes included).
	local function convertLine(b, sp)
		local tt = b.treeTab
		if not tt.showConvert then
			return nil
		end
		local c = tt.controls
		local function label(ctl)
			return ctl and ctl:GetProperty("label") or ""
		end
		return {
			text = label(c.specConvertText),
			button = label(c.specConvert),
			allButton = label(c.specConvertAll),
			current = treeVersions[sp.treeVersion] and treeVersions[sp.treeVersion].display or tostring(sp.treeVersion),
			latest = treeVersions[latestTreeVersion] and treeVersions[latestTreeVersion].display or tostring(latestTreeVersion),
		}
	end

	-- The jewels in the tree's sockets, as PassiveTreeView:Draw shows them: `[id, overlay, ring, outer, inner, x, y]`
	-- per socket with a jewel and allocated: the jewel's art (GetJewelSocketOverlay), and its radius rings where POB
	-- draws them (`ring`: "" for none, else which art; `x, y`: where, Impossible Escape's at its keystones, one entry each).
	local function jewels(b, sp, granted)
		local out = { }
		local viewer = b.treeTab.viewer
		for id, node in pairs(sp.nodes) do
			if node.type == "Socket" and shown(node) then
				local ok, _, jewel = pcall(b.itemsTab.GetSocketAndJewelForNodeID, b.itemsTab, id)
				local isAlloc = node.alloc or (granted and granted[id])
				if ok and jewel and isAlloc then
					local useAltArt = node.expansionJewel and not (jewel.base and jewel.base.subType == "Blightcore")
					local overlay
					local tree = sp.tree
					if tree.ddsCoords and next(tree.ddsCoords) ~= nil then
						-- PoE2's POB draws the jewel itself: a unique's own art where the tree has it, else its base's
						local own = jewel.rarity == "UNIQUE" and jewel.title
							and (tree.ddsMap and tree.ddsMap[jewel.title] or tree.assets[jewel.title] or tree.spriteMap and tree.spriteMap[jewel.title])
						overlay = own and jewel.title or jewel.baseName or ""
					else
						overlay = viewer:GetJewelSocketOverlay(jewel, useAltArt) or ""
					end
					local conquered = jewel.jewelData and jewel.jewelData.conqueredBy and jewel.jewelData.conqueredBy.conqueror
						and jewel.jewelData.conqueredBy.conqueror.type and jewel.jewelData.conqueredBy.conqueror.type:match("^abyss_")
					local radData = node.alloc and node.name ~= "Charm Socket" and (not node.expansionJewel or node.expansionJewel.size == 2)
						and not conquered and jewel.jewelRadiusIndex and b.data.jewelRadius[jewel.jewelRadiusIndex]
					local title = jewel.title or ""
					if radData and title:match("Impossible Escape") then
						for name in pairs(jewel.jewelData and jewel.jewelData.impossibleEscapeKeystones or { }) do
							local k = sp.tree.keystoneMap[name]
							if k and k.x and k.y then
								out[#out + 1] = { id, overlay, "impossible", radData.outer, 150, round(k.x), round(k.y) }
							end
						end
						radData = nil
					end
					local ring = ""
					if radData then
						ring = (title:match("^Brutal Restraint") and "maraketh") or (title:match("^Elegant Hubris") and "eternal")
							or (title:match("^Glorious Vanity") and "vaal") or (title:match("^Lethal Pride") and "karui")
							or (title:match("^Militant Faith") and "templar") or (title:match("^Heroic Tragedy") and "kalguur") or "shaded"
					end
					out[#out + 1] = { id, overlay, ring, radData and radData.outer or 0, radData and radData.inner * 1.06 or 0, round(node.x), round(node.y) }
				end
			end
		end
		table.sort(out, function(a, c)
			return a[1] < c[1]
		end)
		return out
	end

	-- What changes as the build changes: the allocation, class and ascendancy, points, the spec list, the search, and
	-- cluster jewel nodes (`extra`).
	function ops.read()
		local b = s.build()
		local sp = spec()
		local tree = sp.tree
		local asc, ascIndex = ascendancies(tree)
		local extraNodes, extraEdges, seen = { }, { }, { }
		for _, sub in pairs(sp.subGraphs or { }) do
			for _, node in ipairs(sub.nodes or { }) do
				if shown(node) then
					extraNodes[#extraNodes + 1] = node
				end
			end
			edges(sub.connectors or { }, sp.nodes, tree.orbitRadii, extraEdges, seen)
		end
		local env = b.calcsTab and b.calcsTab.mainEnv
		local display = b.controls.pointDisplay or { }
		return {
			key = tostring(sp.treeVersion),
			alloc = keys(sp.allocNodes),
			granted = keys(env and env.grantedPassives),
			className = sp.curClassName or "",
			classId = sp.curClassId,
			ascendancy = sp.curAscendClassBaseName or "",
			ascendancyName = sp.curAscendClassName or "",
			secondary = sp.curSecondaryAscendClass and sp.curSecondaryAscendClass.id or "",
			points = display.str or "",
			pointsDetail = display.req or "",
			specs = specControl(),
			search = b.treeTab.viewer.searchStr or "",
			matches = matches(b.treeTab.viewer.searchStr),
			extra = { nodes = nodeColumns(extraNodes, ascIndex), edges = extraEdges, asc = asc },
			jewels = jewels(b, sp, env and env.grantedPassives),
			convert = convertLine(b, sp),
			-- PassiveTreeView's view as the build saved it (zoomLevel, and the offset of the tree's centre in pixels)
			view = { level = b.treeTab.viewer.zoomLevel or 3, x = b.treeTab.viewer.zoomX or 0, y = b.treeTab.viewer.zoomY or 0 },
		}
	end

	local function nodeOf(id)
		return assert(spec().nodes[tonumber(id)], "no such passive")
	end

	local function ids(list)
		local out = { }
		for i, node in ipairs(list or { }) do
			out[i] = node.id
		end
		return out
	end

	-- A tooltip as POB fills it, as lines `{ text, size }` or `{ sep = true }` (as service/items.lua reads them).
	local function tooltipLines(fill)
		local tip = s.tooltip()
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

	-- The mastery effects a mastery can take (TreeTab:OpenMasteryPopup's list): `{ id, label }`.
	local function masteryEffects(node)
		local out = { }
		if node.type ~= "Mastery" or not node.masteryEffects then
			return out
		end
		local selections = spec().masterySelections or { }
		for _, effect in pairs(node.masteryEffects) do
			local taken = isValueInTable(selections, effect.effect)
			if not taken or taken == node.id then
				out[#out + 1] = { id = effect.effect, label = table.concat(effect.stats, " / ") }
			end
		end
		table.sort(out, function(a, b)
			return a.id < b.id
		end)
		return out
	end

	-- A node under the pointer (`{ id }`): POB's tooltip for it, the path a click would allocate (PassiveTreeView's
	-- hover path) or the nodes a click would deallocate (its dependants).
	function ops.node(a)
		local b = s.build()
		local node = nodeOf(a.id)
		local viewer = b.treeTab.viewer
		-- PoE2's POB gives the tooltip the allocated nodes' "increased Effect of Small Passive Skills", as its Draw
		-- adds it up (PoE1's takes no such argument)
		local incSmall = 0
		for _, n in pairs(b.spec.allocNodes) do
			if n.modList then
				incSmall = incSmall + n.modList:Sum("INC", nil, "SmallPassiveSkillEffect")
			end
		end
		local lines = tooltipLines(function(tip)
			viewer:AddNodeTooltip(tip, node, b, incSmall)
		end)
		local path = { }
		if not node.alloc and node.path and #(node.intuitiveLeapLikesAffecting or { }) == 0 then
			path = ids(node.path)
		end
		return {
			id = node.id,
			alloc = node.alloc and true or false,
			reachable = node.path ~= nil,
			path = path,
			depends = node.alloc and ids(node.depends) or { },
			lines = lines,
			masteries = masteryEffects(node),
		}
	end

	local function changed()
		local b = s.build()
		b.spec:AddUndoState()
		b.buildFlag = true
	end

	-- PassiveTreeView's left click on node `id`: deallocate it (with what depends on it), or allocate the path to it;
	-- on another ascendancy's node, change to that ascendancy first (`{ confirm }` when that would reset the tree:
	-- call again with `choice` "continue" to reset or "connect" to connect a start node of the class).
	-- A mastery with effects answers `{ masteries }`: choose one with `tree.mastery`.
	function ops.click(a)
		local b = s.build()
		local sp = spec()
		local node = nodeOf(a.id)
		if node.alloc then
			sp:DeallocNode(node)
			changed()
			return { done = true }
		end
		if node.ascendancyName then
			if node.isBloodline and sp.tree.alternate_ascendancies then
				if not sp.curSecondaryAscendClass or node.ascendancyName ~= sp.curSecondaryAscendClass.id then
					for id, data in pairs(sp.tree.alternate_ascendancies) do
						if data.id == node.ascendancyName then
							sp:SelectSecondaryAscendClass(id)
							sp:SetWindowTitleWithBuildClass()
							changed()
							break
						end
					end
				end
			elseif (sp.curAscendClassId == 0 or node.ascendancyName ~= sp.curAscendClassBaseName)
				and not (sp.curSecondaryAscendClass and node.ascendancyName == sp.curSecondaryAscendClass.id) then
				local target
				for id, ascendClass in pairs(sp.curClass.classes) do
					if ascendClass.id == node.ascendancyName then
						target = id
						break
					end
				end
				if target then
					sp:SelectAscendClass(target)
					sp:SetWindowTitleWithBuildClass()
					changed()
				else
					local classId, class
					for cid, classData in pairs(sp.tree.classes) do
						for aid, ascendClass in pairs(classData.classes) do
							if ascendClass.id == node.ascendancyName then
								classId, class, target = cid, classData, aid
								break
							end
						end
						if classId then
							break
						end
					end
					if classId then
						local function switch()
							sp:SelectClass(classId)
							sp:SelectAscendClass(target)
							local clicked = sp.nodes[node.id]
							if clicked and not clicked.alloc then
								sp:AllocNode(clicked)
							end
							sp:SetWindowTitleWithBuildClass()
							changed()
							return { done = true }
						end
						if sp:CountAllocNodes() == 0 or sp:IsClassConnected(classId) or a.choice == "continue" then
							return switch()
						elseif a.choice == "connect" then
							if sp:ConnectToClass(classId) then
								return switch()
							end
							return { done = false }
						end
						return { confirm = {
							title = "Class Change",
							text = "Changing class to " .. class.name .. " will reset your passive tree.\nThis can be avoided by connecting one of the " .. class.name .. " starting nodes to your tree.",
							continue = "Continue",
							connect = "Connect Path",
						} }
					end
				end
			end
		end
		node = sp.nodes[node.id] or node
		if node.path and not node.alloc then
			if node.type == "Mastery" and node.masteryEffects then
				return { masteries = masteryEffects(node) }
			end
			sp:AllocNode(node)
			changed()
		end
		return { done = true }
	end

	-- Chooses mastery effect `effect` for mastery `id`, allocating it, as TreeTab's mastery popup saves it.
	function ops.mastery(a)
		local tt = s.build().treeTab
		local node = nodeOf(a.id)
		assert(node.type == "Mastery" and node.masteryEffects, "not a mastery")
		tt:SaveMasteryPopup(node, { selValue = { id = tonumber(a.effect) } })
		return { done = true }
	end

	-- Searches the tree as its search box does (the text is kept with the build, as POB keeps it): `{ text }`.
	function ops.search(a)
		local text = tostring(a.text or "")
		s.act(s.build().treeTab.controls.treeSearch, text)
		return { search = text, matches = matches(text) }
	end

	-- Makes spec `index` (1-based) the active one, through the spec drop-down.
	-- A popup POB opened (main:OpenPopup): its title, its text (the labels, in order) and its buttons.
	local function popupOf(popup)
		local text, buttons = { }, { }
		local function label(c)
			local l = c.GetProperty and c:GetProperty("label") or c.label
			return type(l) == "string" and l or nil
		end
		for _, c in ipairs(popup.controls or { }) do
			text[#text + 1] = label(c)
		end
		for name, c in pairs(popup.controls or { }) do
			if type(name) == "string" then
				if c.onClick then
					buttons[#buttons + 1] = { id = name, label = label(c) or name }
				elseif label(c) then
					text[#text + 1] = label(c)
				end
			end
		end
		table.sort(buttons, function(a, b)
			return (popup.controls[a.id].x or 0) < (popup.controls[b.id].x or 0)
		end)
		return { title = popup.title or "", text = table.concat(text, "\n"), buttons = buttons }
	end

	-- TreeTab's convert buttons, by their own onClick. "Convert to …" (ConvertToVersion: the converted tree becomes
	-- a new spec after the current one) answers POB's message popup `{ message }`. "Convert all trees to …" first
	-- answers its confirmation `{ confirm }` (the popup closed again); called with `button` (the id of the popup's
	-- button chosen), it opens it once more and presses that button.
	function ops.convert(a)
		local b = s.build()
		local c = b.treeTab.controls
		local before = #main.popups
		if a.all then
			c.specConvertAll.onClick()
			local popup = #main.popups > before and main.popups[1]
			assert(popup, "Path of Building opened no confirmation")
			if not a.button then
				local ask = popupOf(popup)
				main:ClosePopup()
				return { confirm = ask }
			end
			local button = assert(popup.controls[a.button], "no such button")
			button.onClick()
			while #main.popups > before do
				main:ClosePopup()
			end
			b.buildFlag = true
			return { done = true }
		end
		c.specConvert.onClick()
		local message
		if #main.popups > before then
			message = popupOf(main.popups[1])
			while #main.popups > before do
				main:ClosePopup()
			end
		end
		b.buildFlag = true
		return { done = true, message = message }
	end

	function ops.spec(a)
		specControl()
		s.act(s.build().treeTab.controls.specSelect, tonumber(a.index))
		return { done = true }
	end

	return ops
end
