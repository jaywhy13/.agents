# Quick Site Design Reference

## Light theme palette

```css
:root {
  /* backgrounds */
  --bg: #ffffff;
  --bg-soft: #f8f9fa;
  --panel: #f3f4f6;
  --panel-2: #e9ecef;

  /* borders */
  --border: #dee2e6;
  --border-soft: #e9ecef;

  /* text */
  --text: #1a1d21;
  --muted: #6b7280;
  --faint: #9ca3af;

  /* accent (adjust per-site — these are neutral defaults) */
  --accent: #2563eb;
  --accent-2: #7c3aed;

  /* status */
  --green: #16a34a;
  --amber: #d97706;
  --red: #dc2626;

  /* highlight / diff */
  --hl: rgba(37,99,235,.10);
  --hl-border: #2563eb;

  --radius: 12px;
  --sans: 'Inter', system-ui, -apple-system, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
```

## Layout — fluid, not fixed-width

Never put `max-width` on the outer `section` or nav containers. Use `clamp()` padding instead so the layout fills whatever viewport the reader has. Reserve `max-width` only for prose text blocks (where line length matters for readability).

```css
/* Outer containers — fluid */
section { padding: 64px clamp(24px, 5vw, 80px); }
.nav-inner { padding: 11px clamp(16px, 4vw, 60px); }
footer { padding: 40px clamp(24px, 5vw, 80px) 70px; }

/* Inner prose — constrain only text for readability */
.lead { max-width: 760px; }
```

## Recommended Google Fonts CDN line

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

## Page structure

Every site follows this skeleton — adapt sections to the content, never skip the hero.

```
1. Sticky nav (brand + section links)
2. Hero — goal statement, key numbers, who benefits
3. The problem / the why  ← before the solution, always
4. The solution / proposal
5. Interactive detail section(s)
6. Supporting evidence / tradeoffs
7. The ask / next steps
8. Footer
```

## Nav pattern (sticky, light)

```html
<header style="
  position: sticky; top: 0; z-index: 50;
  background: rgba(255,255,255,0.88);
  backdrop-filter: saturate(150%) blur(12px);
  border-bottom: 1px solid var(--border-soft);
">
  <div style="display:flex; align-items:center;
              gap:18px; padding:11px clamp(16px,4vw,60px); flex-wrap:wrap;">
    <span style="font-weight:800; font-size:15px; letter-spacing:-.02em;">Site Title</span>
    <nav style="display:flex; gap:4px; margin-left:auto;">
      <a href="#problem" style="font-size:13px; color:var(--muted); padding:5px 10px;
         border-radius:8px; font-weight:500; text-decoration:none;">Problem</a>
      <!-- ... -->
    </nav>
  </div>
</header>
```

## Hero pattern

Lead with the outcome, not the mechanism. The three stat cards are optional but effective when numbers make the case.

```html
<section style="max-width:1180px; margin:0 auto; padding:80px 28px 40px;">
  <span style="font-size:12.5px; font-weight:700; letter-spacing:.14em;
    text-transform:uppercase; color:var(--accent);">Proposal · for [audience]</span>
  <h1 style="font-size:clamp(34px,5vw,56px); margin:14px 0 18px; font-weight:800;
    color:var(--text); letter-spacing:-.03em; line-height:1.1;">
    What you want to achieve.<br/>In one or two lines.
  </h1>
  <p style="font-size:18px; color:var(--muted); max-width:760px;">
    One paragraph on why this matters and who benefits. Goals first.
  </p>
</section>
```

## Interactive patterns

### Tab switcher (no JS framework)

```html
<div style="display:flex; gap:8px; border-bottom:2px solid var(--border); margin-bottom:24px;">
  <button onclick="switchTab('a')" id="tab-a"
    style="padding:8px 16px; border:none; background:none; cursor:pointer;
           font-weight:600; color:var(--accent); border-bottom:2px solid var(--accent);
           margin-bottom:-2px;">Tab A</button>
  <button onclick="switchTab('b')" id="tab-b"
    style="padding:8px 16px; border:none; background:none; cursor:pointer;
           font-weight:500; color:var(--muted);">Tab B</button>
</div>
<div id="pane-a"><!-- content --></div>
<div id="pane-b" style="display:none"><!-- content --></div>
<script>
function switchTab(name) {
  ['a','b'].forEach(t => {
    document.getElementById('pane-' + t).style.display = t === name ? '' : 'none';
    var btn = document.getElementById('tab-' + t);
    btn.style.color = t === name ? 'var(--accent)' : 'var(--muted)';
    btn.style.fontWeight = t === name ? '600' : '500';
    btn.style.borderBottom = t === name ? '2px solid var(--accent)' : 'none';
  });
}
</script>
```

### Expandable section (accordion)

```html
<div style="border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; margin:8px 0;">
  <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'"
    style="width:100%; text-align:left; padding:14px 18px; background:var(--panel);
           border:none; cursor:pointer; font-weight:600; font-size:15px;">
    Section title ▸
  </button>
  <div style="padding:18px; display:none;">
    Content here.
  </div>
</div>
```

### Before / after toggle

```html
<div style="display:flex; gap:12px; margin-bottom:12px;">
  <button onclick="showView('before')" id="btn-before"
    style="padding:6px 16px; border-radius:999px; border:1px solid var(--accent);
           background:var(--accent); color:#fff; cursor:pointer; font-weight:600;">Before</button>
  <button onclick="showView('after')" id="btn-after"
    style="padding:6px 16px; border-radius:999px; border:1px solid var(--border);
           background:none; color:var(--muted); cursor:pointer; font-weight:500;">After</button>
</div>
<div id="view-before"><!-- before content --></div>
<div id="view-after" style="display:none"><!-- after content --></div>
<script>
function showView(v) {
  document.getElementById('view-before').style.display = v === 'before' ? '' : 'none';
  document.getElementById('view-after').style.display  = v === 'after'  ? '' : 'none';
  // toggle button styles
  var active = {background:'var(--accent)',color:'#fff',borderColor:'var(--accent)',fontWeight:'600'};
  var idle   = {background:'none',color:'var(--muted)',borderColor:'var(--border)',fontWeight:'500'};
  Object.assign(document.getElementById('btn-before').style, v==='before' ? active : idle);
  Object.assign(document.getElementById('btn-after').style,  v==='after'  ? active : idle);
}
</script>
```

## Card pattern

```html
<div style="background:var(--panel); border:1px solid var(--border);
  border-radius:var(--radius); padding:22px 24px;">
  <div style="font-weight:700; color:var(--text); margin-bottom:8px;">Card title</div>
  <p style="color:var(--muted); margin:0;">Supporting detail.</p>
</div>
```

## Stat card (accent top border)

```html
<div style="background:var(--panel); border:1px solid var(--border);
  border-radius:var(--radius); padding:22px; position:relative; overflow:hidden;">
  <div style="position:absolute;inset:0 0 auto 0;height:3px;
    background:linear-gradient(90deg,var(--accent),var(--accent-2))"></div>
  <div style="font-size:32px; font-weight:700; font-family:var(--mono);">42%</div>
  <div style="color:var(--muted); font-size:13.5px; margin-top:6px;">What this number means.</div>
</div>
```

## What to avoid

- `max-width` on layout containers (`section`, nav wrappers, footer) — use `clamp()` padding so the site expands with the browser window. Only cap inner prose blocks.
- Dark backgrounds as the default — use light theme per the principles
- Leading with implementation class names or config keys
- Listing everything — cut until only what matters remains
- Inline `style` sprawl on repeated elements — define CSS variables or a `<style>` block
- External JS frameworks — vanilla JS is sufficient for all interactive patterns above
- Deploying without previewing locally first
