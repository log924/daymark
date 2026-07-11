"use client";

import { useState } from "react";

const stories = [
  {
    source: "The Verge",
    time: "42 min ago",
    tag: "AI & work",
    title: "The quiet shift from AI novelty to useful infrastructure",
    body: "The most interesting AI products are becoming less conspicuous: embedded in work, shaped by good defaults, and measured by the time they give back.",
    reason: "Matches your focus on applied AI · Original reporting",
    color: "coral",
  },
  {
    source: "Stratechery",
    time: "3 hrs ago",
    tag: "Technology",
    title: "The new distribution advantage",
    body: "Why the next wave of durable companies may be built around a direct relationship with their audience, rather than a platform dependency.",
    reason: "High signal source · Connects to 4 saved articles",
    color: "blue",
  },
  {
    source: "The Browser",
    time: "Yesterday",
    tag: "Essay",
    title: "How to pay better attention",
    body: "A gentle, clear-eyed argument for treating attention as something you practice—not merely something that gets captured.",
    reason: "A slower counterpoint to today’s tech reading",
    color: "gold",
  },
];

const sources = [
  ["The Verge", "12 new", "#ff795e"],
  ["Stratechery", "5 new", "#4b7cff"],
  ["The Browser", "8 new", "#e6a83b"],
  ["Dense Discovery", "4 new", "#6ea78a"],
];

export default function Home() {
  const [active, setActive] = useState("Brief");
  const [saved, setSaved] = useState<number[]>([]);
  const [translated, setTranslated] = useState<number[]>([]);
  const [showAll, setShowAll] = useState(false);

  const toggle = (item: number, setter: React.Dispatch<React.SetStateAction<number[]>>) =>
    setter((current) => (current.includes(item) ? current.filter((id) => id !== item) : [...current, item]));

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Daymark home"><span>✦</span> daymark</a>
        <nav aria-label="Main navigation">
          {["Brief", "Latest", "Sources", "Saved"].map((name) => (
            <button key={name} className={active === name ? "nav-item active" : "nav-item"} onClick={() => setActive(name)}>
              <span>{name === "Brief" ? "◒" : name === "Latest" ? "◷" : name === "Sources" ? "◉" : "♡"}</span>{name}
              {name === "Latest" && <b>29</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button className="nav-item"><span>⚙</span> Settings</button>
        <div className="profile"><div className="avatar">Y</div><div><strong>You</strong><small>Personal workspace</small></div><span>⌄</span></div>
      </aside>

      <section className="content" id="top">
        <header className="topbar">
          <div className="crumb"><span className="sun">☀</span><span>Friday, July 11</span><em>•</em><span>Good morning</span></div>
          <div className="top-actions"><button className="icon-button" aria-label="Search">⌕</button><button className="add-button">+ Add source</button></div>
        </header>

        <div className="brief-head">
          <div><p className="eyebrow">YOUR DAILY SELECTION</p><h1>Worth your<br/><i>attention.</i></h1></div>
          <div className="brief-note"><span className="line"/><p>I reviewed <strong>29 new pieces</strong> from your reading list and found <strong>6 worth slowing down for.</strong></p></div>
        </div>

        <div className="stats"><div><strong>06</strong><span>Selected today</span></div><div><strong>29</strong><span>New since yesterday</span></div><div><strong>12m</strong><span>Estimated reading</span></div></div>

        <section className="section-heading"><div><p className="eyebrow">THE SHORTLIST</p><h2>Start here</h2></div><button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "See all 6"} <span>→</span></button></section>

        <section className="story-grid">
          {stories.map((story, index) => (
            <article className={`story-card ${story.color}`} key={story.title}>
              <div className="story-meta"><span className="source-dot"/><span>{story.source}</span><em>·</em><span>{story.time}</span><button onClick={() => toggle(index, setSaved)} aria-label="Save article">{saved.includes(index) ? "♥" : "♡"}</button></div>
              <span className="tag">{story.tag}</span><h3>{story.title}</h3><p>{story.body}</p>
              <div className="story-foot"><span>✦ {story.reason}</span><div className="story-actions"><button onClick={() => toggle(index, setTranslated)}>{translated.includes(index) ? "中文已就绪" : "译为中文"}</button><button className="read">Read <span>→</span></button></div></div>
            </article>
          ))}
        </section>

        {showAll && <div className="more-note">3 more selections are ready in your complete morning brief.</div>}

        <section className="sources-panel"><div className="section-heading"><div><p className="eyebrow">FOLLOWING</p><h2>From your sources</h2></div><button className="text-button">Manage sources <span>→</span></button></div><div className="source-list">{sources.map(([name, count, color]) => <button key={name} className="source-row"><span className="source-logo" style={{background: color}}>{name.charAt(0)}</span><strong>{name}</strong><span>{count}</span><i>→</i></button>)}</div></section>
      </section>
    </main>
  );
}
