// Builds the profile's stats and language cards as SVGs, light and dark, into the
// directory given as the first argument. Uses only public data, so the workflow's
// own GITHUB_TOKEN is enough (a personal token adds private contributions), and no
// third-party card service is involved.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "dist";
const login = process.env.USERNAME ?? "imonirulislam";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

const query = `query($login: String!) {
  user(login: $login) {
    followers { totalCount }
    pullRequests { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar { totalContributions }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
const user = json.data.user;
const cc = user.contributionsCollection;

const stats = [
  ["Contributions (last year)", cc.contributionCalendar.totalContributions],
  ["Commits (last year)", cc.totalCommitContributions],
  ["Pull requests (last year)", cc.totalPullRequestContributions],
  ["Public repositories", user.repositories.totalCount],
];

const sizes = new Map();
for (const repo of user.repositories.nodes) {
  for (const { size, node } of repo.languages.edges) {
    const prev = sizes.get(node.name);
    sizes.set(node.name, { size: (prev?.size ?? 0) + size, color: node.color ?? "#8b949e" });
  }
}
const total = [...sizes.values()].reduce((n, l) => n + l.size, 0) || 1;
const langs = [...sizes.entries()]
  .map(([name, l]) => ({ name, color: l.color, pct: (l.size / total) * 100 }))
  .sort((a, b) => b.pct - a.pct)
  .slice(0, 8);

const themes = {
  light: { bg: "#ffffff", border: "#d0d7de", title: "#0969da", text: "#1f2328", muted: "#59636e", track: "#eaeef2" },
  dark: { bg: "#0d1117", border: "#30363d", title: "#58a6ff", text: "#e6edf3", muted: "#9198a1", track: "#21262d" },
};
const font = `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const W = 420;
const H = 200;

const frame = (t, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${font}>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
  <text x="24" y="38" font-size="16" font-weight="600" fill="${t.title}">${esc(title)}</text>
${body}
</svg>
`;

const statsCard = (t) =>
  frame(
    t,
    "GitHub stats",
    stats
      .map(([label, value], i) => {
        const y = 78 + i * 30;
        return `  <text x="24" y="${y}" font-size="14" fill="${t.muted}">${esc(label)}</text>
  <text x="${W - 24}" y="${y}" font-size="15" font-weight="600" fill="${t.text}" text-anchor="end">${value.toLocaleString("en-US")}</text>`;
      })
      .join("\n"),
  );

const langsCard = (t) => {
  const barW = W - 48;
  let x = 24;
  const bar = langs
    .map((l) => {
      const w = (l.pct / 100) * barW;
      const seg = `  <rect x="${x.toFixed(2)}" y="56" width="${w.toFixed(2)}" height="8" fill="${l.color}"/>`;
      x += w;
      return seg;
    })
    .join("\n");
  const legend = langs
    .map((l, i) => {
      const cx = 24 + (i % 2) * (barW / 2);
      const cy = 92 + Math.floor(i / 2) * 26;
      return `  <circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${l.color}"/>
  <text x="${cx + 16}" y="${cy}" font-size="13" fill="${t.text}">${esc(l.name)} <tspan fill="${t.muted}">${l.pct.toFixed(1)}%</tspan></text>`;
    })
    .join("\n");
  return frame(
    t,
    "Most used languages",
    `  <clipPath id="bar"><rect x="24" y="56" width="${barW}" height="8" rx="4"/></clipPath>
  <rect x="24" y="56" width="${barW}" height="8" rx="4" fill="${t.track}"/>
  <g clip-path="url(#bar)">
${bar}
  </g>
${legend}`,
  );
};

mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(themes)) {
  const suffix = name === "dark" ? "-dark" : "";
  writeFileSync(join(out, `stats${suffix}.svg`), statsCard(t));
  writeFileSync(join(out, `languages${suffix}.svg`), langsCard(t));
}
console.log(`wrote cards for ${login} to ${out}`);
