// Manga English Titles v1.7 - Seanime plugin (DISPLAY ONLY, no hooks) - with tray on/off switch
//
// Entry page: reads the manga's data straight from the page
//   ([data-manga-entry-page] -> data-media JSON: id, title, synonyms),
//   picks the English synonym, and rewrites the big title text.
//   This works for AniList AND custom-source manga since it only uses what the page has.
// Cards: card elements only carry the id, so the plugin uses a map of id -> English title built from
//   (a) every entry page you open (remembered between restarts) and
//   (b) your manga collection, read-only.
// Nothing is ever written to Seanime's data.
//
// v1.3: added a second-pass picker so English synonyms without common stopwords
//   (e.g. "Star Ginseng Shop", "Prepaid Dragon King Tanks Everything!") are accepted.

function init() {
    $ui.register((ctx) => {
        const DEBUG = true
        const log = (...a) => { if (DEBUG) console.log("[manga-english-titles]", ...a) }

        const EN = new Set(("the of in a an and to with for is are my his her who as at on by from that this " +
            "after was not but it your you me we be new life world another again get got have has will do what " +
            "if when i've i'm").split(" "))
        const FOREIGN = new Set(("le la les du des un une et el los las del por para und der die das il lo " +
            "gli che nel dei de da").split(" "))
        const ROMAJI = new Set(("no ni wo wa ga shite shita suru dake kara made nai datta deshita desu na ka mo").split(" "))

        // A word that can be fully split into pinyin / romaji / Korean-romanization style syllables
        // (optional onset + vowels + optional n/ng/r coda). English words like "star", "shop", "dragon",
        // "everything" do NOT match; "yuzhi", "longwang", "suoyou" do.
        const CJK_SYL = /^(?:(?:ch|sh|zh|ng|ny|ts|ky|gy|hy|my|ry|by|py|kw|gw|[bcdfghjklmnpqrstwxyz])?[aeiou]+(?:ng|n|r)?)+$/

        // Does this title already look like English? (2+ words, and either has English filler words
        // or most words don't parse as romanized CJK syllables)
        const looksEnglish = (s) => {
            const ws = String(s || "").toLowerCase().replace(/[\u2018\u2019]/g, "'")
                .split(/[^a-z']+/).filter(Boolean).map((w) => w.replace(/'/g, "")).filter(Boolean)
            if (ws.length < 2) return false
            if (ws.some((w) => EN.has(w))) return true
            const n = ws.filter((w) => !CJK_SYL.test(w)).length
            return n / ws.length >= 0.5
        }

        const pickEnglish = (cands, exclude, englishTitle, current) => {
            // If the current title already looks English, never use the loose guess (pass 2)
            const blockLoose = (current || []).some(looksEnglish)
            const ex = (exclude || []).map((s) => String(s || "").trim().toLowerCase()).filter(Boolean)
            let best1 = null, score1 = 0   // pass 1: stopword-based (strict)
            let best2 = null, score2 = 0   // pass 2: not-romanized-CJK based (fallback)
            for (let i = 0; i < cands.length; i++) {
                const c = String(cands[i] || "").trim()
                if (c.length < 3) continue
                if (ex.indexOf(c.toLowerCase()) !== -1) continue
                if (/[^\x00-\x7F\u2018\u2019\u201C\u201D\u2013\u2014\u2026]/.test(c)) continue
                if (/\b[lL]['\u2019][a-zA-Z]/.test(c)) continue
                const words = c.toLowerCase().replace(/[\u2018\u2019]/g, "'").split(/[^a-z']+/).filter(Boolean)
                let en = 0, fo = 0, ro = 0
                for (const w of words) {
                    if (EN.has(w)) en++
                    if (FOREIGN.has(w)) fo++
                    if (ROMAJI.has(w)) ro++
                }
                if (fo > 0) continue
                const sig = c.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !EN.has(w.toLowerCase()))
                if (sig.length) {
                    const caps = sig.filter((w) => /^[A-Z]/.test(w)).length
                    if (caps / sig.length < 0.6) continue
                }
                // pass 1
                const s1 = en * 2 - ro * 2
                if (s1 >= 2 && s1 > score1) { best1 = c; score1 = s1 }
                // pass 2
                if (!blockLoose && ro === 0 && words.length >= 2) {
                    const clean = words.map((w) => w.replace(/'/g, ""))
                    const nonCjk = clean.filter((w) => w.length > 0 && !CJK_SYL.test(w)).length
                    const frac = nonCjk / clean.length
                    if (nonCjk >= 1 && frac >= 0.5) {
                        const s2 = frac + 0.01 * nonCjk
                        if (s2 > score2) { best2 = c; score2 = s2 }
                    }
                }
            }
            // Order: strict synonym match -> AniList's own English title -> loose synonym match
            const eng = String(englishTitle || "").trim()
            const engOk = eng && ex.indexOf(eng.toLowerCase()) === -1 ? eng : null
            return best1 || engOk || best2
        }

        const toArr = (x) => {
            const out = []
            if (!x) return out
            for (let i = 0; i < x.length; i++) if (x[i] != null) out.push(String(x[i]))
            return out
        }

        // id -> { en, orig[] }
        const map = {}
        try {
            const saved = $storage.get("mget.map")
            if (saved) for (const k in saved) map[k] = saved[k]
        } catch (e) { /* storage optional */ }

        const persist = () => { try { $storage.set("mget.map", map) } catch (e) { /* optional */ } }

        // On/off switch (remembered between restarts)
        let on = true
        try {
            const s = $storage.get("mget.enabled")
            if (s === false) on = false
        } catch (e) { /* optional */ }
        const enabledState = ctx.state(on)

        // Per-manga manual choice: id -> chosen title, or "__orig__" to keep the original title.
        // No entry = automatic pick.
        const overrides = {}
        try {
            const so = $storage.get("mget.overrides")
            if (so) for (const k in so) overrides[k] = so[k]
        } catch (e) { /* optional */ }
        const saveOverrides = () => { try { $storage.set("mget.overrides", overrides) } catch (e) { /* optional */ } }

        // What the tray chooser shows: the manga whose entry page is open
        const trayEntry = ctx.state(null)
        let curMedia = null
        let lastTrayKey = ""

        // media: AniList-shaped object (from page JSON or from the collection)
        const remember = (m) => {
            if (!m || m.id == null || !m.title) return null
            const t = m.title
            const romaji = t.romaji ? String(t.romaji) : ""
            const native = t.native ? String(t.native) : ""
            const english = t.english ? String(t.english) : ""
            const pref = t.userPreferred ? String(t.userPreferred) : ""
            const id = String(m.id)
            const orig = [pref, romaji, english, native].filter(Boolean).map((s) => s.trim())
            let auto = pickEnglish(toArr(m.synonyms), [romaji, native], english, [pref, romaji, english])
            if (!auto && english) auto = english.trim()
            if (!auto) log("no English for", m.id, "| title:", JSON.stringify(t), "| synonyms:", JSON.stringify(toArr(m.synonyms)))

            // Every English-looking name, offered in the tray chooser
            const cands = []
            const seen = {}
            const addCand = (s) => {
                s = String(s || "").trim()
                if (s.length < 3) return
                const k = s.toLowerCase()
                if (seen[k]) return
                if (k === romaji.toLowerCase() || k === native.toLowerCase()) return
                if (/[^\x00-\x7F\u2018\u2019\u201C\u201D\u2013\u2014\u2026]/.test(s)) return
                seen[k] = 1
                cands.push(s)
            }
            addCand(english)
            toArr(m.synonyms).forEach(addCand)

            const ov = overrides[id]
            let en = auto
            if (ov === "__orig__") en = orig[0] || null
            else if (ov) en = ov
            if (en) log("picked", m.id, ":", pref || romaji, "=>", en, ov ? "(manual)" : "(auto)")
            const info = { en, auto, cands, orig }
            map[String(m.id)] = info
            return info
        }

        const loadCollection = async () => {
            try {
                const col = await ctx.manga.getCollection()
                const root = (col && (col.mediaListCollection || col.MediaListCollection)) || col
                let n = 0
                for (const l of toArrLike(root && root.lists)) {
                    for (const entry of toArrLike(l && l.entries)) {
                        if (entry && entry.media && remember(entry.media)) n++
                    }
                }
                persist()
                log("collection read, mapped", n, "manga; map size", Object.keys(map).length)
            } catch (err) {
                log("could not read collection:", String(err))
            }
        }
        function toArrLike(x) {
            const out = []
            if (!x) return out
            for (let i = 0; i < x.length; i++) out.push(x[i])
            return out
        }

        // ---------------- Entry page ----------------
        const TITLE_SEL = '[data-media-page-header-entry-details-title-container="true"] > div'

        const fixEntry = async () => {
            if (!on) return
            try {
                const page = await ctx.dom.queryOne('[data-manga-entry-page="true"]')
                if (!page) return
                const raw = await page.getAttribute("data-media")
                if (!raw) return
                let media
                try { media = JSON.parse(raw) } catch (e) { log("bad data-media JSON"); return }
                const hadBefore = !!map[String(media.id)]
                curMedia = media
                const info = remember(media)
                if (!info) return
                if (!hadBefore) persist()
                const key = String(media.id) + "|" + (overrides[String(media.id)] || "")
                if (key !== lastTrayKey) {
                    lastTrayKey = key
                    trayEntry.set({
                        id: String(media.id),
                        name: (media.title && (media.title.userPreferred || media.title.romaji)) || String(media.id),
                        auto: info.auto || "",
                        cands: info.cands,
                        chosen: overrides[String(media.id)] || "",
                    })
                }
                if (!info.en) { log("entry", media.id, ": no English title found"); return }
                const el = await ctx.dom.queryOne(TITLE_SEL)
                if (!el) return
                const cur = String((await el.getText()) || "").trim()
                if (cur && cur !== info.en) {
                    el.setText(info.en)
                    log("entry", media.id, ":", cur, "=>", info.en)
                }
            } catch (err) {
                log("entry error:", String(err))
            }
        }

        // ---------------- Cards ----------------
        const CARD_SEL = '[data-media-entry-card-container="true"][data-media-type="manga"]'

        const fixCards = async (cards) => {
            if (!on) return
            for (const c of cards) {
                try {
                    const id = await c.getAttribute("data-media-id")
                    const info = id ? map[String(id)] : null
                    if (!info) continue
                    const p = await c.queryOne('[data-media-entry-card-title-section-title="true"]')
                    if (!p) continue
                    const t = String((await p.getText()) || "").trim()
                    if (info.en && t && t !== info.en &&
                        (info.orig.indexOf(t) !== -1 || (info.cands || []).indexOf(t) !== -1)) {
                        p.setText(info.en)
                        log("card", id, ":", t, "=>", info.en)
                    }
                } catch (err) {
                    log("card error:", String(err))
                }
            }
        }

        // Put the original titles back (used when switched off)
        const revertAll = async () => {
            try {
                const page = await ctx.dom.queryOne('[data-manga-entry-page="true"]')
                if (page) {
                    const raw = await page.getAttribute("data-media")
                    const media = raw ? JSON.parse(raw) : null
                    const info = media ? map[String(media.id)] : null
                    const el = await ctx.dom.queryOne(TITLE_SEL)
                    if (info && el && info.orig[0]) {
                        const cur = String((await el.getText()) || "").trim()
                        if (cur === info.en) el.setText(info.orig[0])
                    }
                }
            } catch (err) { log("revert entry error:", String(err)) }
            try {
                const cards = await ctx.dom.query(CARD_SEL)
                for (const c of toArrLike(cards)) {
                    const id = await c.getAttribute("data-media-id")
                    const info = id ? map[String(id)] : null
                    if (!info || !info.orig[0]) continue
                    const p = await c.queryOne('[data-media-entry-card-title-section-title="true"]')
                    if (!p) continue
                    const t = String((await p.getText()) || "").trim()
                    if (t === info.en) p.setText(info.orig[0])
                }
            } catch (err) { log("revert cards error:", String(err)) }
        }

        const applyAll = async () => {
            await fixEntry()
            try {
                const cards = await ctx.dom.query(CARD_SEL)
                await fixCards(toArrLike(cards))
            } catch (err) { log("apply cards error:", String(err)) }
        }

        // ---------------- Tray ----------------
        const tray = ctx.newTray({
            iconUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><text x='12' y='17' font-size='14' font-weight='bold' text-anchor='middle' fill='%23999'>En</text></svg>",
            withContent: true,
            width: "16rem",
        })
        const onToggle = ctx.eventHandler("mget-toggle", (e) => {
            on = !!(e && e.value)
            enabledState.set(on)
            try { $storage.set("mget.enabled", on) } catch (err) { /* optional */ }
            log("enabled:", on)
            if (on) applyAll(); else revertAll()
        })
        const onPick = ctx.eventHandler("mget-pick", (e) => {
            const cur = trayEntry.get()
            if (!cur || !curMedia) return
            const v = String((e && e.value) || "")
            if (!v || v === "__auto__") delete overrides[cur.id]
            else overrides[cur.id] = v
            saveOverrides()
            lastTrayKey = ""
            remember(curMedia)
            persist()
            log("manual choice for", cur.id, ":", v)
            if (on) applyAll()
        })

        tray.render(() => {
            const items = [
                tray.text("Manga English Titles", { style: { fontWeight: "bold" } }),
                tray.switch("Show English titles", { value: enabledState.get(), onChange: onToggle }),
                tray.text(enabledState.get() ? "On" : "Off: original titles shown", { style: { fontSize: "0.8rem", opacity: "0.7" } }),
            ]
            const cur = trayEntry.get()
            if (enabledState.get() && cur) {
                const opts = [{ label: cur.auto ? "Auto: " + cur.auto : "Auto", value: "__auto__" }]
                for (const c of cur.cands) opts.push({ label: c, value: c })
                opts.push({ label: "Original title", value: "__orig__" })
                items.push(tray.text("Open: " + cur.name, { style: { fontSize: "0.8rem", opacity: "0.7" } }))
                items.push(tray.select("Title for this manga", { options: opts, value: cur.chosen || "__auto__", onChange: onPick }))
            }
            return tray.stack(items)
        })

        ctx.screen.onNavigate((e) => {
            const p = String(e.pathname || "")
            log("navigate:", p)
            if (p.indexOf("manga") !== -1 && p.indexOf("entry") !== -1) {
                // The page renders asynchronously; retry a few times.
                fixEntry()
                if (typeof ctx.setTimeout === "function") {
                    ctx.setTimeout(fixEntry, 400)
                    ctx.setTimeout(fixEntry, 1200)
                    ctx.setTimeout(fixEntry, 3000)
                }
            }
        })

        ctx.dom.onReady(async () => {
            ctx.screen.loadCurrent()
            await loadCollection()

            ctx.dom.observe('[data-media-page-header-entry-details-title-container="true"]', () => { fixEntry() })
            ctx.dom.observe('[data-manga-entry-page="true"]', () => { fixEntry() })
            ctx.dom.observe('[data-media-entry-card-container="true"][data-media-type="manga"]', (cards) => { fixCards(cards) })
        })
    })
}
