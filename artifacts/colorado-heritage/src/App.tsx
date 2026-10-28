import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import {
  ArrowRight, ArrowUpRight, BookOpen, Eye, EyeOff, GraduationCap,
  HeartHandshake, Menu, Move, Pencil, RotateCcw, Save, X,
} from 'lucide-react';

type SectionId = 'donation' | 'hero' | 'programs' | 'mission' | 'anniversary' | 'listen' | 'stories' | 'closing';
type Copy = Record<SectionId, Record<string, string>>;
type SiteState = { order: SectionId[]; hidden: SectionId[]; copy: Copy };

const initialCopy: Copy = {
  donation: {
    officeHours: 'School year office hours begin Monday, August 31. Please see our Contact Us page for more details.',
    enrollment: 'Independent School (IS) enrollment is now open. See our Independent School page for details and options.',
    blogNotice: 'See our latest Blog under “About Us”.',
    notice: '*WE ARE ACCEPTING PLEDGE DONATIONS FOR OUR FALL 2026 SCHOLARSHIP JOG-A-THON! PLEASE SEE OUR DONATION PAGE BELOW OR IN OUR SIDE MENU. THANK YOU!',
    button: 'Donation Page',
  },
  hero: {
    eyebrow: '"Pursuing the Knowledge of God."',
    title: 'Colorado Heritage Education School System',
    subtitle: 'A Private Christian School',
    history: 'Serving Homeschooling Families Since 1991',
    image: '/images/colorado-family.jpg',
    primaryButton: 'Explore our programs',
    secondaryButton: 'Our mission',
  },
  programs: {
    kicker: 'How we partner with you',
    title: 'Here is how we partner with you:',
    intro: '',
    p1Title: 'Independent School',
    p1Body: 'The Colorado Heritage Independent School, a private Christian school, provides homeschooling families “umbrella school” services (record keeping, etc.). Homeschooling families who are not enrolled in an independent school must report their records to a public school district. Students enrolled in our Independent School are considered private school students, and as such, submit records to Colorado Heritage. We also provide curriculum and scheduling advice, as well as encouragement, to families who are pursuing the noble pursuit of educating at home.',
    p1Link: 'Learn More',
    p2Title: 'Academy',
    p2Body: 'For over 30 years, Colorado Heritage has provided quality Christ-centered K - 12 classes, meeting the academic needs of homeschooling families. Our elementary and junior high classes are varied, stimulating, and fulfilling. Many of our high school Diploma Program students take our challenging high school classes, crafting a robust 4-year plan. Our Academy also offers great fellowship opportunities with like-minded homeschoolers.',
    p2Link: 'Learn more',
    p3Title: 'High School Diploma Program',
    p3Body: 'Our Diploma Program provides home-educated high school students with a 4-year high school plan that challenges and encourages them both academically and spiritually. Many of our Diploma Program students pursue much of their course work through our Academy along with classes taken at home. Upon successfully completing our Diploma Program, students will receive a private Christian school transcript and have the option of participating in our graduation ceremony. Colleges and other institutions highly esteem our high school graduates. Four diploma levels are available to pursue: Diploma, Honors, High Honors, and Highest Honors.',
    p3Link: 'Learn More',
  },
  mission: {
    kicker: 'Colorado Heritage Education School System',
    title: 'Thankful for God’s provision and faithfulness.',
    body: 'Colorado Heritage Education School System is thankful for God’s provision and faithfulness to us over the past 30+ years as we have worked to serve the needs of home educators here in Colorado, across the United States, and around the world.',
    quote: '“Pursuing the Knowledge of God.”',
    image: '/images/student-study.jpg',
    link: 'Learn more about CHESS',
  },
  anniversary: {
    title: 'Colorado Heritage, Established 1991',
    body: 'Celebrating 35 years',
    button: 'Donation Page',
  },
  listen: {
    kicker: 'Listen and Learn',
    title: 'Why is Christian Education so Important?',
    body: 'Listen to Pastor Baxter Ong give the introduction to our Parents’ Night Out Panel Discussion. Since 1991, we have remained deeply committed to helping families guard their children’s academic and spiritual paths.',
    image: '/images/pastor-talk.jpg',
    button: 'Listen and Learn',
  },
  stories: {
    kicker: 'From the CHESS blog',
    title: 'Blog',
    date1: 'August 12, 2026',
    post1: 'Thy Word is a Lamp unto My feet, and a Light unto My Path',
    date2: 'March 27, 2026',
    post2: 'Why CHRISTIAN Education? (And, Happy 35th Birthday to CHESS!!)',
    date3: 'July 14, 2025',
    post3: 'Who Stole the Lost Tools of Learning?',
    date4: 'June 28, 2024',
    post4: 'Do You Love Jesus?',
    date5: 'October 30, 2023',
    post5: 'Prepare in the Nest',
    button: 'Visit the blog',
  },
  closing: {
    kicker: 'Colorado Heritage',
    title: 'Serving Homeschooling Families Since 1991',
    body: 'Home educators here in Colorado, across the United States, and around the world.',
    button: 'Donation Page',
  },
};

const defaultSite: SiteState = {
  order: ['donation', 'hero', 'programs', 'mission', 'anniversary', 'listen', 'stories', 'closing'],
  hidden: [],
  copy: initialCopy,
};

const sectionNames: Record<SectionId, string> = {
  donation: 'Announcements & donation',
  hero: 'Welcome / hero',
  programs: 'Our programs',
  mission: 'Our mission',
  anniversary: '35-year anniversary',
  listen: 'Listen and Learn',
  stories: 'Blog stories',
  closing: 'Next steps',
};

const sectionFields: Record<SectionId, { key: string; label: string; multiline?: boolean; image?: boolean }[]> = {
  donation: [
    { key: 'officeHours', label: 'Office-hours announcement', multiline: true },
    { key: 'enrollment', label: 'Enrollment announcement', multiline: true },
    { key: 'blogNotice', label: 'Blog announcement', multiline: true },
    { key: 'notice', label: 'Donation notice', multiline: true },
    { key: 'button', label: 'Button label' },
  ],
  hero: [
    { key: 'eyebrow', label: 'Tagline' }, { key: 'title', label: 'Main heading', multiline: true },
    { key: 'subtitle', label: 'School description' }, { key: 'history', label: 'Since statement' },
    { key: 'image', label: 'Photo URL', image: true }, { key: 'primaryButton', label: 'Primary button' },
    { key: 'secondaryButton', label: 'Secondary button' },
  ],
  programs: [
    { key: 'kicker', label: 'Small heading' }, { key: 'title', label: 'Section heading' }, { key: 'intro', label: 'Introduction', multiline: true },
    { key: 'p1Title', label: 'Program 1 title' }, { key: 'p1Body', label: 'Program 1 description', multiline: true }, { key: 'p1Link', label: 'Program 1 link label' },
    { key: 'p2Title', label: 'Program 2 title' }, { key: 'p2Body', label: 'Program 2 description', multiline: true }, { key: 'p2Link', label: 'Program 2 link label' },
    { key: 'p3Title', label: 'Program 3 title' }, { key: 'p3Body', label: 'Program 3 description', multiline: true }, { key: 'p3Link', label: 'Program 3 link label' },
  ],
  mission: [
    { key: 'kicker', label: 'Small heading' }, { key: 'title', label: 'Section heading' }, { key: 'body', label: 'Mission copy', multiline: true },
    { key: 'quote', label: 'Tagline / quotation' }, { key: 'image', label: 'Photo URL', image: true }, { key: 'link', label: 'Link label' },
  ],
  anniversary: [
    { key: 'title', label: 'Section heading' }, { key: 'body', label: 'Description', multiline: true }, { key: 'button', label: 'Button label' },
  ],
  listen: [
    { key: 'kicker', label: 'Small heading' }, { key: 'title', label: 'Section heading' }, { key: 'body', label: 'Description', multiline: true },
    { key: 'image', label: 'Photo URL', image: true }, { key: 'button', label: 'Button label' },
  ],
  stories: [
    { key: 'kicker', label: 'Small heading' }, { key: 'title', label: 'Section heading' },
    ...[1, 2, 3, 4, 5].flatMap((n) => [
      { key: `date${n}`, label: `Story ${n} date` },
      { key: `post${n}`, label: `Story ${n} title` },
    ]),
    { key: 'button', label: 'Button label' },
  ],
  closing: [
    { key: 'kicker', label: 'Small heading' }, { key: 'title', label: 'Heading' }, { key: 'body', label: 'Description', multiline: true },
    { key: 'button', label: 'Button label' },
  ],
};

const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const imageUrl = (path: string) => path.startsWith('http') ? path : asset(path);
const donateUrl = 'https://www.coloradoheritage.org/how-to-donate-2';
const programLinks = [
  'https://www.coloradoheritage.org/independent-school-3',
  'https://www.coloradoheritage.org/academy',
  'https://www.coloradoheritage.org/high-school-diploma-program-copy-1',
];
const storyLinks = [
  'https://www.coloradoheritage.org/news/2026/8/12/thy-word-is-a-lamp-unto-my-feet-and-a-light-unto-my-path',
  'https://www.coloradoheritage.org/news/2026/3/27/why-christian-education-and-a-happy-35th-birthday-to-chess',
  'https://www.coloradoheritage.org/news/2025/7/14/who-stole-the-lost-tools-of-learning',
  'https://www.coloradoheritage.org/news/2024/6/28/do-you-love-jesus',
  'https://www.coloradoheritage.org/news/2023/10/30/prepare-in-the-nest',
];

function App() {
  const [site, setSite] = useState<SiteState>(() => {
    try {
      const stored = localStorage.getItem('chess-homepage-content-v1');
      if (stored) {
        const parsed = JSON.parse(stored) as SiteState;
        return { ...defaultSite, ...parsed, copy: { ...initialCopy, ...parsed.copy } };
      }
    } catch { /* start with the original site content when saved data is unavailable */ }
    return defaultSite;
  });
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<SectionId>('hero');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const [toast, setToast] = useState('');
  const [dragged, setDragged] = useState<SectionId | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const copy = site.copy;
  const updateCopy = (id: SectionId, key: string, value: string) => {
    setSite((current) => ({ ...current, copy: { ...current.copy, [id]: { ...current.copy[id], [key]: value } } }));
    setIsSaved(false);
  };
  const save = () => {
    try {
      localStorage.setItem('chess-homepage-content-v1', JSON.stringify(site));
      setIsSaved(true);
      setToast('Your changes are saved on this device.');
    } catch {
      setToast('Could not save. Please check your browser storage settings.');
    }
  };
  const reset = () => {
    if (!window.confirm('Reset all edits and restore the original homepage content?')) return;
    setSite(defaultSite);
    localStorage.removeItem('chess-homepage-content-v1');
    setIsSaved(true);
    setToast('Original homepage content restored.');
  };
  const visibleOrder = useMemo(() => site.order.filter((id) => !site.hidden.includes(id)), [site.order, site.hidden]);
  const hideToggle = (id: SectionId) => {
    setSite((current) => ({
      ...current,
      hidden: current.hidden.includes(id) ? current.hidden.filter((item) => item !== id) : [...current.hidden, id],
    }));
    setIsSaved(false);
  };
  const reorder = (source: SectionId, target: SectionId) => {
    if (source === target) return;
    setSite((current) => {
      const next = [...current.order];
      const from = next.indexOf(source);
      next.splice(from, 1);
      const to = next.indexOf(target);
      next.splice(to, 0, source);
      return { ...current, order: next };
    });
    setIsSaved(false);
  };

  const sectionClass = (id: SectionId) => editing ? `editable ${selected === id ? 'edit-target' : ''}` : '';
  const clickSection = (id: SectionId) => editing ? setSelected(id) : undefined;
  const sectionHint = (id: SectionId) => editing && selected === id ? <span className="edit-hint">Selected section</span> : null;

  const renderDonation = () => (
    <section id="donation" className={`donation ${sectionClass('donation')}`} onClick={() => clickSection('donation')}>
      {sectionHint('donation')}
      <p>{copy.donation.notice}</p>
      <a className="button" href={donateUrl} target="_blank" rel="noreferrer" onClick={(e) => editing && e.preventDefault()}>{copy.donation.button}</a>
    </section>
  );
  const renderHero = () => (
    <section id="home" className={`hero ${sectionClass('hero')}`} style={{ '--hero-image': `url("${imageUrl(copy.hero.image)}")` } as CSSProperties} onClick={() => clickSection('hero')}>
      {sectionHint('hero')}
      <div className="hero-inner">
        <div className="eyebrow">{copy.hero.eyebrow}</div>
        <h1>{copy.hero.title}</h1>
        <p className="hero-sub">{copy.hero.subtitle}<br />{copy.hero.history}</p>
        <div className="hero-actions">
          <a className="button gold" href="#programs" onClick={(e) => editing && e.preventDefault()}>{copy.hero.primaryButton}<ArrowRight size={15} /></a>
          <a className="button light" href="#mission" onClick={(e) => editing && e.preventDefault()}>{copy.hero.secondaryButton}</a>
        </div>
        <div className="hero-note">Serving homeschooling families since 1991</div>
      </div>
    </section>
  );
  const renderPrograms = () => (
    <section id="programs" className={`section program-section ${sectionClass('programs')}`} onClick={() => clickSection('programs')}>
      {sectionHint('programs')}
      <div className="container">
        <div className="intro-head">
          <div className="section-kicker">{copy.programs.kicker}</div>
          <h2 className="section-title">{copy.programs.title}</h2>
          <p className="section-intro">{copy.programs.intro}</p>
        </div>
        <div className="program-grid">
          {[1, 2, 3].map((n) => {
            const Icon = n === 1 ? HeartHandshake : n === 2 ? BookOpen : GraduationCap;
            return <article className="program-card" key={n}>
              <span className="program-index">0{n}</span>
              <div className="program-icon"><Icon size={23} strokeWidth={1.7} /></div>
              <h3>{copy.programs[`p${n}Title`]}</h3>
              <p>{copy.programs[`p${n}Body`]}</p>
            <a className="text-link" href={programLinks[n - 1]} target="_blank" rel="noreferrer" onClick={(e) => editing && e.preventDefault()}>{copy.programs[`p${n}Link`]} <span>→</span></a>
            </article>;
          })}
        </div>
      </div>
    </section>
  );
  const renderMission = () => (
    <section id="mission" className={`section ${sectionClass('mission')}`} onClick={() => clickSection('mission')}>
      {sectionHint('mission')}
      <div className="container split">
        <div className="image-frame"><img src={imageUrl(copy.mission.image)} alt="A student learning at home" /></div>
        <div className="mission-copy">
          <div className="section-kicker">{copy.mission.kicker}</div>
          <h2 className="section-title">{copy.mission.title}</h2>
          <p>{copy.mission.body}</p>
          <div className="scripture">{copy.mission.quote}</div>
          <a className="text-link" href="#closing" onClick={(e) => editing && e.preventDefault()}>{copy.mission.link} <span>→</span></a>
        </div>
      </div>
    </section>
  );
  const renderAnniversary = () => (
    <section className={`section anniversary ${sectionClass('anniversary')}`} onClick={() => clickSection('anniversary')}>
      {sectionHint('anniversary')}
      <div className="container">
        <div className="anniv-number">35<small>Years of serving families</small></div>
        <div>
          <div className="section-kicker">Since 1991 · 2026</div>
          <h2 className="section-title">{copy.anniversary.title}</h2>
          <p>{copy.anniversary.body}</p>
          <a className="button gold" href={donateUrl} target="_blank" rel="noreferrer" onClick={(e) => editing && e.preventDefault()}>{copy.anniversary.button} <ArrowRight size={15} /></a>
        </div>
      </div>
    </section>
  );
  const renderListen = () => (
    <section id="listen" className={`section listen ${sectionClass('listen')}`} onClick={() => clickSection('listen')}>
      {sectionHint('listen')}
      <div className="container">
        <div className="listen-panel">
          <div className="listen-image"><img src={imageUrl(copy.listen.image)} alt="A teacher sharing a thoughtful lesson with families" /></div>
          <div className="listen-copy">
            <div className="listen-label">{copy.listen.kicker}</div>
            <h2>{copy.listen.title}</h2>
            <p>{copy.listen.body}</p>
            <a className="text-link" href="https://www.youtube.com/watch?v=Q-C-yeSEOrQ" target="_blank" rel="noreferrer" onClick={(e) => editing && e.preventDefault()}>{copy.listen.button} <ArrowUpRight size={15} /></a>
          </div>
        </div>
      </div>
    </section>
  );
  const renderStories = () => (
    <section id="stories" className={`section stories ${sectionClass('stories')}`} onClick={() => clickSection('stories')}>
      {sectionHint('stories')}
      <div className="container">
        <div className="stories-head">
          <div>
            <div className="section-kicker">{copy.stories.kicker}</div>
            <h2 className="section-title">{copy.stories.title}</h2>
          </div>
          <a className="button" href="https://www.coloradoheritage.org/" target="_blank" rel="noreferrer" onClick={(e) => editing && e.preventDefault()}>{copy.stories.button}<ArrowUpRight size={14} /></a>
        </div>
        <div className="story-list">
          {[1, 2, 3, 4, 5].map((n) => <a className="story" key={n} href={storyLinks[n - 1]} target="_blank" rel="noreferrer" onClick={(e) => editing && e.preventDefault()}>
            <div className="story-date">{copy.stories[`date${n}`]}</div>
            <h3>{copy.stories[`post${n}`]}</h3><ArrowRight className="story-arrow" size={17} />
          </a>)}
        </div>
      </div>
    </section>
  );
  const renderClosing = () => (
    <section id="closing" className={`closing ${sectionClass('closing')}`} onClick={() => clickSection('closing')}>
      {sectionHint('closing')}
      <div className="section-kicker">{copy.closing.kicker}</div>
      <h2 className="section-title">{copy.closing.title}</h2>
      <p>{copy.closing.body}</p>
      <a className="button gold" href="#programs" onClick={(e) => editing && e.preventDefault()}>{copy.closing.button}<ArrowRight size={15} /></a>
    </section>
  );

  const renderSection: Record<SectionId, () => ReactElement> = {
    donation: renderDonation, hero: renderHero, programs: renderPrograms, mission: renderMission,
    anniversary: renderAnniversary, listen: renderListen, stories: renderStories, closing: renderClosing,
  };

  const fieldEditor = () => sectionFields[selected].map(({ key, label, multiline, image }) => (
    <div className="field" key={key}>
      <label htmlFor={`edit-${selected}-${key}`}>{label}</label>
      {multiline
        ? <textarea id={`edit-${selected}-${key}`} data-testid={`editor-field-${key}`} value={copy[selected][key] ?? ''} onChange={(e) => updateCopy(selected, key, e.target.value)} />
        : <input id={`edit-${selected}-${key}`} data-testid={`editor-field-${key}`} type="text" value={copy[selected][key] ?? ''} onChange={(e) => updateCopy(selected, key, e.target.value)} placeholder={image ? '/images/your-photo.jpg' : ''} />}
      {image && <span style={{ display: 'block', fontSize: 10, color: '#6b7685', marginTop: 4 }}>Paste a local image path or a trusted image URL.</span>}
    </div>
  ));

  return (
    <div className={`site ${editing ? 'is-editing' : ''}`}>
      {!editing && <>
        <div className="announcement">{copy.donation.officeHours}<br />{copy.donation.enrollment}<br />{copy.donation.blogNotice}</div>
        <header className="masthead">
          <div className="nav-wrap">
            <a className="brand" href="#home" aria-label="CHESS home">
              <img src={asset('/images/chess-seal.png')} alt="Colorado Heritage Education School System seal" />
              <div><div className="brand-name">Colorado Heritage<br />Education School System</div><div className="brand-tag">“Pursuing the Knowledge of God.”</div></div>
            </a>
            <nav className={`nav-links ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
              <a href="#programs" onClick={() => setMenuOpen(false)}>Programs</a>
              <a href="#mission" onClick={() => setMenuOpen(false)}>About CHESS</a>
              <a href="#stories" onClick={() => setMenuOpen(false)}>Blog</a>
              <a href="#listen" onClick={() => setMenuOpen(false)}>Listen &amp; Learn</a>
              <a href={donateUrl} target="_blank" rel="noreferrer" className="nav-donate">Donate</a>
            </nav>
            <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} data-testid="mobile-menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
          </div>
        </header>
      </>}

      {editing && <div className="editor-bar">
        <div className="editor-bar-left"><span className="editor-dot" /><div><div className="editor-title">CHESS Site Editor</div><div className="editor-sub">Changes are private until you preview them.</div></div></div>
        <div className="editor-actions">
          <span className="saved-pill">{isSaved ? 'All changes saved' : 'Unsaved changes'}</span>
          <button type="button" data-testid="reset-site" onClick={reset}><RotateCcw size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Reset</button>
          <button type="button" data-testid="save-site" className="primary" onClick={save}><Save size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Save</button>
          <button type="button" data-testid="preview-site" onClick={() => setEditing(false)}><Eye size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Preview site</button>
        </div>
      </div>}

      {editing && <div className="editor-layout">
        <aside className="editor-sidebar">
          <h2 className="sidebar-heading">Edit your homepage</h2>
          <p className="sidebar-help">Choose a section to update its words and photos. Drag sections to change their order; use the eye to show or hide one.</p>
          <div className="section-list" data-testid="section-list">
            {site.order.map((id) => {
              const isHidden = site.hidden.includes(id);
              return <div
                key={id}
                className={`section-row ${selected === id ? 'selected' : ''} ${dragged === id ? 'dragging' : ''}`}
                draggable
                onDragStart={() => setDragged(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragged) reorder(dragged, id); setDragged(null); }}
                onDragEnd={() => setDragged(null)}
                data-testid={`section-row-${id}`}
              >
                <Move className="drag-handle" size={15} />
                <button className="section-select" type="button" onClick={() => setSelected(id)}>{sectionNames[id]}</button>
                <button className="visibility-btn" type="button" aria-label={`${isHidden ? 'Show' : 'Hide'} ${sectionNames[id]}`} aria-pressed={!isHidden} data-testid={`toggle-${id}`} onClick={() => hideToggle(id)}>{isHidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>;
            })}
          </div>
          <div className="editor-fields">
            <h3>{sectionNames[selected]}</h3>
            {fieldEditor()}
          </div>
        </aside>
        <main className="editor-preview" aria-label="Homepage preview">
          <div className="announcement">{copy.donation.officeHours}<br />{copy.donation.enrollment}<br />{copy.donation.blogNotice}</div>
          <header className="masthead">
            <div className="nav-wrap">
              <a className="brand" href="#home"><img src={asset('/images/chess-seal.png')} alt="CHESS seal" /><div><div className="brand-name">Colorado Heritage<br />Education School System</div><div className="brand-tag">“Pursuing the Knowledge of God.”</div></div></a>
              <nav className="nav-links"><a href="#programs">Programs</a><a href="#mission">About CHESS</a><a href="#stories">Blog</a><a className="nav-donate" href={donateUrl}>Donate</a></nav>
            </div>
          </header>
          {visibleOrder.map((id) => <div key={id}>{renderSection[id]()}</div>)}
          <Footer />
        </main>
      </div>}

      {!editing && <>
        {visibleOrder.map((id) => <div key={id}>{renderSection[id]()}</div>)}
        <Footer />
        <button className="edit-launch" type="button" data-testid="open-editor" onClick={() => setEditing(true)}><Pencil size={15} /> Edit site</button>
      </>}
      {toast && <div className="toast-note" role="status">{toast}</div>}
    </div>
  );
}

function Footer() {
  return <footer className="footer">
    <div className="footer-main">
      <div>
        <div className="footer-brand"><img src={asset('/images/chess-seal.png')} alt="" /><strong>Colorado Heritage<br />Education School System</strong></div>
        <p>A private Christian school serving homeschooling families since 1991.</p>
        <div className="footer-tag">“Pursuing the Knowledge of God.”</div>
      </div>
      <div><h3>Explore CHESS</h3><div className="footer-links"><a href="#programs">Independent School</a><a href="#programs">Academy K–12</a><a href="#programs">High School Diploma Program</a><a href="#stories">News &amp; Blog</a></div></div>
      <div><h3>Connect</h3><div className="footer-links"><a href="https://www.coloradoheritage.org/" target="_blank" rel="noreferrer">Visit the CHESS website <ArrowUpRight size={12} /></a><a href="https://www.coloradoheritage.org/donate" target="_blank" rel="noreferrer">Donation page <ArrowUpRight size={12} /></a><span>Colorado, USA</span></div></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} Colorado Heritage Education School System</span><span>“Pursuing the Knowledge of God.”</span></div>
  </footer>;
}

export default App;
