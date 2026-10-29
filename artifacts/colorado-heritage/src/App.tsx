import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetHomepageContentQueryKey,
  useGetEditorAccess,
  useGetHomepageContent,
  useSaveHomepageContent,
  type HomepageContentState,
} from '@workspace/api-client-react';
import { Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { PublicSiteFooter, PublicSiteHeader, PublicSitePages } from './components/public-site';
import { EditorHome, SiteManager, PhotoUploader } from './components/site-manager';
import { fixText, usePageMeta } from './lib/cms';
import { legacyRouteAliases } from './data/siteSitemap';
import { RouteScroll } from './components/route-scroll';
import {
  ArrowRight, ArrowUpRight, BookOpen, Eye, EyeOff, GraduationCap,
  HeartHandshake, MapPin, Move, Pencil, RotateCcw, Save, X,
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
    audience: 'Christ-centered K-12 classes and homeschool support for families in Greeley, CO',
    applyButton: 'Schedule a Visit / Apply',
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
    { key: 'subtitle', label: 'School description' }, { key: 'audience', label: 'Who we serve (grades and city)', multiline: true }, { key: 'applyButton', label: 'Visit / apply button' }, { key: 'history', label: 'Since statement' },
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
const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const publicPath = (path: string) => `${appBasePath}${path.startsWith('/') ? path : `/${path}`}` || '/';
const donateUrl = publicPath('/donate');
const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const adminPath = `${appBasePath}/admin`.replace(/^$/, '/admin');
const isAdminRoute = (
  window.location.pathname === adminPath ||
  window.location.pathname.startsWith(`${adminPath}/`)
);
const adminBasePath = isAdminRoute ? adminPath : appBasePath;

function hydrateSite(content: HomepageContentState | null | undefined): SiteState {
  if (!content) return defaultSite;
  const savedCopy = content.copy as Partial<Copy>;
  const copy = Object.fromEntries(
    Object.entries(initialCopy).map(([section, fields]) => [
      section,
      Object.fromEntries(Object.entries({ ...fields, ...(savedCopy[section as SectionId] ?? {}) }).map(([k, v]) => [k, fixText(v)])),
    ]),
  ) as Copy;
  return {
    order: content.order as SectionId[],
    hidden: content.hidden as SectionId[],
    copy,
  };
}

const programLinks = [
  publicPath('/programs/independent-school'),
  publicPath('/programs/academy'),
  publicPath('/programs/diploma'),
];
const storyLinks = [
  publicPath('/news/2026/8/12/thy-word-is-a-lamp-unto-my-feet-and-a-light-unto-my-path'),
  publicPath('/news/2026/3/27/why-christian-education-and-a-happy-35th-birthday-to-chess'),
  publicPath('/news/2025/7/14/who-stole-the-lost-tools-of-learning'),
  publicPath('/news/2024/6/28/do-you-love-jesus'),
  publicPath('/news/2023/10/30/prepare-in-the-nest'),
];

function HomepageApp({
  adminMode = false,
  onSignOut,
  publicSiteUrl,
}: {
  adminMode?: boolean;
  onSignOut?: () => void;
  publicSiteUrl?: string;
}) {
  const contentQuery = useGetHomepageContent();
  const saveMutation = useSaveHomepageContent({
    mutation: {
      onSuccess: (response) => {
        setSite(hydrateSite(response.content));
        queryClient.setQueryData(getGetHomepageContentQueryKey(), response);
        setIsSaved(true);
        setToast('Saved. Visitors now see the updated homepage content (no code was published).');
      },
      onError: () => {
        setIsSaved(false);
        setToast('Could not save changes. Please try again.');
      },
    },
  });
  const [site, setSite] = useState<SiteState>(defaultSite);
  const [editing, setEditing] = useState(adminMode);
  const [selected, setSelected] = useState<SectionId>('hero');
  const [isSaved, setIsSaved] = useState(true);
  const [toast, setToast] = useState('');
  const [dragged, setDragged] = useState<SectionId | null>(null);

  useEffect(() => {
    if (contentQuery.data && isSaved) {
      setSite(hydrateSite(contentQuery.data.content));
    }
  }, [contentQuery.data, isSaved]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const copy = site.copy;
  usePageMeta(adminMode ? 'Homepage editor | Colorado Heritage' : 'Colorado Heritage Education School System | Christian K-12 School, Greeley, CO', 'A private Christian K-12 school in Greeley, CO serving homeschooling families since 1991 with an Independent School, Academy classes, and a High School Diploma Program.', '/');
  const updateCopy = (id: SectionId, key: string, value: string) => {
    setSite((current) => ({ ...current, copy: { ...current.copy, [id]: { ...current.copy[id], [key]: value } } }));
    setIsSaved(false);
  };
  const save = () => saveMutation.mutate({ data: site });
  const reset = () => {
    if (!window.confirm('Reset the live homepage to the original starter content? This removes all saved edits for everyone.')) return;
    setSite(defaultSite);
    setIsSaved(false);
    saveMutation.mutate({ data: defaultSite });
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

  // Announcements and donation copy now live in the single slim SiteNotice above the header.
  const renderDonation = () => <></>;
  const renderHero = () => (
    <section id="home" className={`hero ${sectionClass('hero')}`} style={{ '--hero-image': `url("${imageUrl(copy.hero.image)}")` } as CSSProperties} onClick={() => clickSection('hero')}>
      {sectionHint('hero')}
      <div className="hero-inner">
        <div className="eyebrow">{copy.hero.eyebrow}</div>
        <h1>{copy.hero.title}</h1>
        <p className="hero-sub">{copy.hero.subtitle}<br />{copy.hero.history}</p>
        <p className="hero-audience"><MapPin size={15} aria-hidden="true" />{copy.hero.audience}</p>
        <div className="hero-actions">
          <a className="button gold hero-apply" href={publicPath('/families/apply')} data-testid="link-hero-apply" onClick={(e) => editing && e.preventDefault()}>{copy.hero.applyButton}<ArrowRight size={15} /></a>
          <a className="button light" href={publicPath('/programs')} onClick={(e) => editing && e.preventDefault()}>{copy.hero.primaryButton}<ArrowRight size={15} /></a>
          <a className="button light" href={publicPath('/about/our-purpose')} onClick={(e) => editing && e.preventDefault()}>{copy.hero.secondaryButton}</a>
        </div>
        <div className="hero-note">Grades K-12 · Greeley, Colorado · Since 1991</div>
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
            <a className="text-link" href={programLinks[n - 1]} onClick={(e) => editing && e.preventDefault()}>{copy.programs[`p${n}Link`]} <span>→</span></a>
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
        <div className="image-frame"><img src={imageUrl(copy.mission.image)} alt={copy.mission.imageAlt || "A student learning at home"} /></div>
        <div className="mission-copy">
          <div className="section-kicker">{copy.mission.kicker}</div>
          <h2 className="section-title">{copy.mission.title}</h2>
          <p>{copy.mission.body}</p>
          <div className="scripture">{copy.mission.quote}</div>
          <a className="text-link" href={publicPath('/about/our-purpose')} onClick={(e) => editing && e.preventDefault()}>{copy.mission.link} <span>→</span></a>
        </div>
      </div>
    </section>
  );
  const renderAnniversary = () => (
    <AnniversarySection
      copy={copy.anniversary}
      editing={editing}
      className={sectionClass('anniversary')}
      hint={sectionHint('anniversary')}
      onSectionClick={() => clickSection('anniversary')}
    />
  );
  const renderListen = () => (
    <section id="listen" className={`section listen ${sectionClass('listen')}`} onClick={() => clickSection('listen')}>
      {sectionHint('listen')}
      <div className="container">
        <div className="listen-panel">
          <div className="listen-image"><img src={imageUrl(copy.listen.image)} alt={copy.listen.imageAlt || "A teacher sharing a thoughtful lesson with families"} /></div>
          <div className="listen-copy">
            <div className="listen-label">{copy.listen.kicker}</div>
            <h2>{copy.listen.title}</h2>
            <p>{copy.listen.body}</p>
            <a className="text-link" href={publicPath('/listen-learn')} onClick={(e) => editing && e.preventDefault()}>{copy.listen.button} <ArrowUpRight size={15} /></a>
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
          <a className="button" href={publicPath('/news')} onClick={(e) => editing && e.preventDefault()}>{copy.stories.button}<ArrowUpRight size={14} /></a>
        </div>
        <div className="story-list">
          {[1, 2, 3, 4, 5].map((n) => <a className="story" key={n} href={storyLinks[n - 1]} onClick={(e) => editing && e.preventDefault()}>
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
      <a className="button gold" href={donateUrl} onClick={(e) => editing && e.preventDefault()}>{copy.closing.button}<ArrowRight size={15} /></a>
    </section>
  );

  const renderSection: Record<SectionId, () => ReactElement> = {
    donation: renderDonation, hero: renderHero, programs: renderPrograms, mission: renderMission,
    anniversary: renderAnniversary, listen: renderListen, stories: renderStories, closing: renderClosing,
  };

  if (adminMode && contentQuery.isPending) {
    return <div className="admin-message"><p>Loading the shared homepage content…</p></div>;
  }
  if (adminMode && contentQuery.isError) {
    return <div className="admin-message"><h1>Could not load the website</h1><p>Check the connection and reload before editing.</p></div>;
  }

  const fieldEditor = () => sectionFields[selected].map(({ key, label, multiline, image }) => (
    <div className="field" key={key}>
      <label htmlFor={`edit-${selected}-${key}`}>{label}</label>
      {multiline
        ? <textarea id={`edit-${selected}-${key}`} data-testid={`editor-field-${key}`} value={copy[selected][key] ?? ''} onChange={(e) => updateCopy(selected, key, e.target.value)} />
        : <input id={`edit-${selected}-${key}`} data-testid={`editor-field-${key}`} type="text" value={copy[selected][key] ?? ''} onChange={(e) => updateCopy(selected, key, e.target.value)} placeholder={image ? '/images/your-photo.jpg' : ''} />}
      {image && <PhotoUploader label="Upload a resized photo" defaultAlt={copy[selected][`${key}Alt`] || ''} onUploaded={(url, alt) => { updateCopy(selected, key, url); updateCopy(selected, `${key}Alt`, alt); }} />}
    </div>
  ));

  return (
    <div className={`site chess-public ${editing ? 'is-editing' : ''}`}>
      {contentQuery.isError && !adminMode && <div className="content-warning" role="alert">The latest saved homepage could not be loaded. This view may not include recent edits.</div>}
      {!editing && <>
        <SiteNotice copy={copy.donation} editing={editing} onSelect={() => clickSection('donation')} />
        <PublicSiteHeader />
      </>}

      {editing && <div className="editor-bar">
        <div className="editor-bar-left"><span className="editor-dot" /><div><div className="editor-title">CHESS Website Editor</div><div className="editor-sub">Saving updates homepage content only. It does not publish website code.</div></div></div>
        <div className="editor-actions">
          <span className="saved-pill">{saveMutation.isPending ? 'Saving…' : isSaved ? 'All changes saved' : 'Unsaved changes'}</span>
          <button type="button" data-testid="reset-site" onClick={reset} disabled={saveMutation.isPending}><RotateCcw size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Reset</button>
          <button type="button" data-testid="save-site" className="primary" onClick={save} disabled={saveMutation.isPending}><Save size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Save content</button>
          <button type="button" data-testid="preview-site" onClick={() => setEditing(false)}><Eye size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Preview site</button>
          {adminMode && publicSiteUrl && <a className="editor-public-link" href={publicSiteUrl} target="_blank" rel="noreferrer">Open public site <ArrowUpRight size={13} /></a>}
          {onSignOut && <button type="button" onClick={onSignOut}>Sign out</button>}
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
          <SiteNotice copy={copy.donation} editing={editing} onSelect={() => clickSection('donation')} />
          <PublicSiteHeader editing />
          {visibleOrder.map((id) => <div key={id}>{renderSection[id]()}</div>)}
          <PublicSiteFooter editing />
        </main>
      </div>}

      {!editing && <>
        {visibleOrder.map((id) => <div key={id}>{renderSection[id]()}</div>)}
        <PublicSiteFooter editing={editing} />
        {adminMode && <button className="edit-launch" type="button" data-testid="open-editor" onClick={() => setEditing(true)}><Pencil size={15} /> Back to editor</button>}
      </>}
      {toast && <div className="toast-note" role="status">{toast}</div>}
    </div>
  );
}

function SiteNotice({ copy, editing, onSelect }: { copy: Copy['donation']; editing: boolean; onSelect: () => void }) {
  const [dismissed, setDismissed] = useState(() => !editing && typeof window !== 'undefined' && window.sessionStorage.getItem('chess-notice-dismissed') === '1');
  const [expanded, setExpanded] = useState(false);
  if (dismissed) return null;
  const items = [copy.enrollment, copy.officeHours, copy.blogNotice].filter(Boolean);
  return (
    <div className={`site-notice ${expanded ? 'is-expanded' : ''}`} role="region" aria-label="School notice" onClick={() => editing && onSelect()}>
      <div className="site-notice-inner">
        <span className="site-notice-label">Notice</span>
        <p className="site-notice-text">{items[0]}{expanded && items.slice(1).map((t) => <span key={t}><br />{t}</span>)}{expanded && copy.notice && <span><br />{copy.notice.charAt(0) + copy.notice.slice(1).toLowerCase()}</span>}</p>
        {(items.length > 1 || copy.notice) && <button type="button" className="site-notice-more" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }} aria-expanded={expanded}>{expanded ? 'Less' : 'More'}</button>}
        <a className="site-notice-donate" href={donateUrl} onClick={(e) => editing && e.preventDefault()}>{copy.button}</a>
        {!editing && <button type="button" className="site-notice-close" aria-label="Dismiss notice" data-testid="button-dismiss-notice" onClick={() => { window.sessionStorage.setItem('chess-notice-dismissed', '1'); setDismissed(true); }}><X size={15} /></button>}
      </div>
    </div>
  );
}

function AnniversarySection({
  copy,
  editing,
  className,
  hint,
  onSectionClick,
}: {
  copy: Copy['anniversary'];
  editing: boolean;
  className: string;
  hint: ReactElement | null;
  onSectionClick: () => void;
}) {
  const prefersReducedMotion = useRef(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [count, setCount] = useState(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return editing || reduced ? 35 : 0;
  });
  const [revealed, setRevealed] = useState(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return editing || reduced;
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = media.matches;
    if (editing || media.matches || !('IntersectionObserver' in window)) {
      setCount(35);
      setRevealed(true);
      return;
    }

    const section = sectionRef.current;
    if (!section) return;
    let frame = 0;
    let observer: IntersectionObserver | undefined;
    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      prefersReducedMotion.current = event.matches;
      if (event.matches) {
        setCount(35);
        setRevealed(true);
        observer?.disconnect();
        window.cancelAnimationFrame(frame);
      }
    };
    media.addEventListener('change', handleMotionPreferenceChange);
    const animateCount = () => {
      const startedAt = performance.now();
      const duration = 1250;
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(eased * 35));
        if (progress < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    };
    observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setRevealed(true);
      observer?.disconnect();
      if (prefersReducedMotion.current) setCount(35);
      else animateCount();
    }, { threshold: 0.28 });
    observer.observe(section);

    return () => {
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      media.removeEventListener('change', handleMotionPreferenceChange);
    };
  }, [editing]);

  return (
    <section
      ref={sectionRef}
      data-testid="anniversary-section"
      className={`section anniversary ${className} ${editing ? '' : `anniversary-motion ${revealed ? 'is-visible' : ''}`}`}
      onClick={onSectionClick}
    >
      {hint}
      <div className="container">
        <div className="anniv-number anniversary-reveal">
          <span data-testid="anniversary-count" aria-hidden="true">{count}</span>
          <span className="sr-only">35 years of serving families</span>
          <small aria-hidden="true">Years of serving families</small>
        </div>
        <div className="anniversary-reveal">
          <div className="section-kicker">Since 1991 · 2026</div>
          <h2 className="section-title">{copy.title}</h2>
          <p>{copy.body}</p>
          <a className="button gold" href={donateUrl} onClick={(e) => editing && e.preventDefault()}>{copy.button} <ArrowRight size={15} /></a>
        </div>
      </div>
    </section>
  );
}

function AdminGate({ basePath, publicSiteUrl }: { basePath: string; publicSiteUrl: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const accessQuery = useGetEditorAccess({
    query: { enabled: Boolean(isLoaded && isSignedIn), retry: false },
  });

  if (!isLoaded) {
    return <div className="admin-message"><p>Checking staff sign-in…</p></div>;
  }

  if (!isSignedIn) {
    return (
      <div className="admin-message">
        <img src={asset('/images/chess-seal.png')} alt="" />
        <p className="section-kicker">Colorado Heritage</p>
        <h1>Staff website editor</h1>
        <p>Sign in with an approved staff account to edit the public website.</p>
        <a className="button gold" href={`${basePath}/sign-in`}>Staff sign in <ArrowRight size={15} /></a>
        <a className="admin-public-link" href={publicSiteUrl}>Visit the public website</a>
      </div>
    );
  }

  if (accessQuery.isPending) {
    return <div className="admin-message"><p>Verifying editor access…</p></div>;
  }

  if (accessQuery.isError || !accessQuery.data?.allowed) {
    return (
      <div className="admin-message">
        <h1>Editor access is not enabled for this account</h1>
        <p>Ask a CHESS administrator to approve your staff email address.</p>
        <button className="button" type="button" onClick={() => signOut({ redirectUrl: publicSiteUrl })}>Sign out</button>
        <a className="admin-public-link" href={publicSiteUrl}>Visit the public website</a>
      </div>
    );
  }

  return <EditorChooser publicSiteUrl={publicSiteUrl} onSignOut={() => signOut({ redirectUrl: publicSiteUrl })} />;
}

function EditorChooser({ publicSiteUrl, onSignOut }: { publicSiteUrl: string; onSignOut: () => void }) {
  const [tool, setToolState] = useState<'home' | 'homepage' | 'site'>(() => {
    const t = new URLSearchParams(window.location.search).get('tool');
    return t === 'homepage' || t === 'site' ? t : 'home';
  });
  const setTool = (next: 'home' | 'homepage' | 'site') => {
    const url = new URL(window.location.href);
    if (next === 'home') url.searchParams.delete('tool'); else url.searchParams.set('tool', next);
    window.history.replaceState(null, '', url.toString());
    setToolState(next);
  };
  if (tool === 'homepage') return <>
    <button type="button" className="cms-back-chip" onClick={() => setTool('home')}>Editor home</button>
    <HomepageApp adminMode publicSiteUrl={publicSiteUrl} onSignOut={onSignOut} />
  </>;
  if (tool === 'site') return <SiteManager onBack={() => setTool('home')} onSignOut={onSignOut} publicSiteUrl={publicSiteUrl} />;
  return <EditorHome onChoose={setTool} onSignOut={onSignOut} publicSiteUrl={publicSiteUrl} />;
}

function SignInPage({ basePath, publicSiteUrl }: { basePath: string; publicSiteUrl: string }) {
  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-heading">
        <img src={asset('/images/chess-seal.png')} alt="Colorado Heritage seal" />
        <div><strong>Colorado Heritage</strong><span>Staff website editor</span></div>
      </div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      <a className="admin-public-link" href={publicSiteUrl}>Back to public website</a>
    </div>
  );
}

function SignUpPage({ basePath }: { basePath: string }) {
  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-heading">
        <img src={asset('/images/chess-seal.png')} alt="Colorado Heritage seal" />
        <div><strong>Colorado Heritage</strong><span>Staff website editor</span></div>
      </div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      <p className="admin-auth-note">Only approved staff accounts can edit or publish the website.</p>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryCache = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        queryCache.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryCache]);

  return null;
}

function ClerkAdminApp({ basePath, publicSiteUrl }: { basePath: string; publicSiteUrl: string }) {
  const [, setLocation] = useLocation();
  const stripBase = (path: string) =>
    basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={{
        theme: shadcn,
        cssLayerName: 'clerk',
        options: {
          logoPlacement: 'inside',
          logoLinkUrl: publicSiteUrl,
          logoImageUrl: `${window.location.origin}${asset('/images/chess-seal.png')}`,
        },
        variables: {
          colorPrimary: '#0D008C',
          colorForeground: '#1A365D',
          colorMutedForeground: '#64748B',
          colorBackground: '#FFFFFF',
          colorInput: '#FFFFFF',
          colorInputForeground: '#1A365D',
          colorNeutral: '#D6DCE8',
          borderRadius: '0.8rem',
          fontFamily: 'Lato, sans-serif',
        },
        elements: {
          socialButtonsBlockButton: {
            color: '#1A365D',
            backgroundColor: '#FFFFFF',
            borderColor: '#D6DCE8',
          },
          socialButtonsBlockButtonText: { color: '#1A365D' },
          formButtonPrimary: { color: '#FFFFFF', backgroundColor: '#0D008C' },
          formFieldInput: { color: '#1A365D', backgroundColor: '#FFFFFF' },
          footerActionLink: { color: '#0D008C' },
        },
      }}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={basePath || '/'}
      signUpFallbackRedirectUrl={basePath || '/'}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{
        signIn: { start: { title: 'Staff sign in', subtitle: 'Sign in to edit the CHESS website.' } },
        signUp: { start: { title: 'Staff account', subtitle: 'Create an account with an approved staff email.' } },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/sign-in/*?" component={() => <SignInPage basePath={basePath} publicSiteUrl={publicSiteUrl} />} />
          <Route path="/sign-up/*?" component={() => <SignUpPage basePath={basePath} />} />
          <Route path="/" component={() => <AdminGate basePath={basePath} publicSiteUrl={publicSiteUrl} />} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function PublicWebsite() {
  const [location] = useLocation();
  const path = decodeURI(location.split('?')[0].replace(/\/+$/, '') || '/');
  const aliasTarget = legacyRouteAliases[path]
    ?? (path.startsWith('/new-events/') ? path.replace(/^\/new-events/, '/events') : undefined)
    ?? (path.startsWith('/news/category/') || path.startsWith('/news/tag/') ? '/news' : undefined);

  if (aliasTarget && aliasTarget !== path) return <Redirect to={aliasTarget} />;
  if (path === '/') return <HomepageApp />;

  return (
    <div className="chess-public chess-site-frame">
      <PublicSiteHeader />
      <PublicSitePages />
      <PublicSiteFooter />
    </div>
  );
}

function App() {
  const adminMode = isAdminRoute;
  if (adminMode && !clerkPubKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the app environment.');
  }

  if (adminMode) {
    const publicSiteUrl = new URL(appBasePath || '/', window.location.origin).toString();
    return (
      <WouterRouter base={adminBasePath}>
        <RouteScroll />
        <ClerkAdminApp basePath={adminBasePath} publicSiteUrl={publicSiteUrl} />
      </WouterRouter>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={appBasePath}>
        <RouteScroll />
        <PublicWebsite />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
