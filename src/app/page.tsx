import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, CheckCheck, Circle, Contact, FileText, FolderKanban, LayoutDashboard, Receipt, ShieldCheck, Users, Bell, MoreHorizontal, Plus, ChevronRight, Paperclip } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import styles from "./landing.module.css";

const capabilities = [
  { icon: Contact, title: "From first hello to signed proposal.", copy: "Keep leads, follow-ups and proposals connected. Give every opportunity a clear next step.", label: "Client relationships", tags: ["Leads", "Clients", "Proposals"] },
  { icon: FolderKanban, title: "Great work deserves a clear plan.", copy: "Bring your team, tasks, milestones and shared files together around each project.", label: "Project delivery", tags: ["Tasks", "Milestones", "Files"] },
  { icon: Receipt, title: "The details behind getting paid.", copy: "Create invoices, record payments and keep outstanding balances in view, with reports to see the bigger picture.", label: "Billing & reporting", tags: ["Invoices", "Payments", "Reports"] },
];

function WorkspacePreview() {
  return <div className={styles.preview} aria-label="Illustrative OmixDesk workspace with sample project data">
    <div className={styles.previewChrome}><span><i /><i /><i /></span><span>OmixDesk / Workspace preview</span><ShieldCheck size={13} aria-hidden="true" /></div>
    <div className={styles.previewLayout}>
      <aside className={styles.previewNav} aria-hidden="true">
        <div className={styles.previewBrand}><BrandMark /><strong>OmixDesk</strong></div>
        {[LayoutDashboard, Contact, Users, FolderKanban, FileText, Receipt].map((Icon, index) => <div key={index} className={index === 3 ? styles.selected : undefined}><Icon size={15} /><span>{["Overview", "Leads", "Clients", "Projects", "Proposals", "Invoices"][index]}</span></div>)}
        <div className={styles.previewTeam}><span>ST</span> Studio team</div>
      </aside>
      <div className={styles.previewContent}>
        <div className={styles.previewTop}><span>Studio workspace <ChevronRight size={12} /> Projects</span><Bell size={15} aria-hidden="true" /></div>
        <div className={styles.previewHeading}><div><p>Project workspace</p><h2>Brand & website launch</h2></div><MoreHorizontal size={20} aria-hidden="true" /></div>
        <div className={styles.previewMeta}><span className={styles.status}>In progress</span><span>Design & development</span></div>
        <div className={styles.previewTabs}><span>Overview</span><span>Tasks</span><span>Files</span><span>Team</span></div>
        <div className={styles.previewSummary}><div><span>Milestones</span><strong>3 of 4</strong></div><div><span>Project team</span><div className={styles.avatars}><i>AM</i><i>SK</i><i>JL</i></div></div><div><span>Progress</span><strong>75%</strong></div></div>
        <div className={styles.progress}><span /></div>
        <div className={styles.milestoneHeading}><strong>Project milestones</strong><span>4 milestones</span></div>
        <div className={styles.milestones}>
          {["Discovery & strategy", "Visual direction", "Website design", "Development & launch"].map((title, index) => <div key={title}>{index < 3 ? <span className={styles.complete}><Check size={12} /></span> : <Circle size={19} className={styles.pending} />}<span>{title}</span><small>{index < 3 ? "Completed" : "In progress"}</small></div>)}
        </div>
        <div className={styles.previewFile}><span><Paperclip size={15} /> Brand guidelines.pdf</span><span>Shared with client <CheckCheck size={15} /></span></div>
      </div>
    </div>
    <div className={styles.previewCaption}><span className={styles.liveDot} /> A connected view of your work <span>Illustrative sample</span></div>
  </div>;
}

export default function HomePage() {
  return <div className={styles.landing}>
    <a className={styles.skip} href="#main">Skip to content</a>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="OmixDesk home"><BrandMark priority /><span>OmixDesk<small>by Omix Solutions</small></span></Link>
      <nav aria-label="Website navigation"><a href="#workspace">Workspace</a><a href="#features">Features</a><a href="#client-experience">Client experience</a></nav>
      <div className={styles.headerActions}><Link href="/login">Sign in</Link><Link className={styles.primary} href="/signup">Get started <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
    </header>
    <main id="main">
      <section className={styles.hero} id="workspace">
        <div className={styles.heroCopy}>
          <span className={styles.intro}><span /> Built for the way agencies work</span>
          <h1>Less managing.<br />More making<br />things happen.</h1>
          <p>Your clients, projects and billing, beautifully organized. One workspace to move from the first conversation to the final invoice.</p>
          <div className={styles.heroActions}><Link className={styles.primary} href="/signup">Create your workspace <ArrowRight size={17} aria-hidden="true" /></Link><a className={styles.secondary} href="#features">Explore OmixDesk</a></div>
          <div className={styles.heroNote}><Check size={15} aria-hidden="true" /> One place for your team. A clear view for your clients.</div>
        </div>
        <div className={styles.heroVisual}><WorkspacePreview /><div className={styles.visualNote}><span><CheckCheck size={18} aria-hidden="true" /></span><div><strong>Everyone on the same page.</strong><p>From your team to your client.</p></div></div></div>
      </section>
      <div className={styles.workflowStrip}><p>Every part of your agency.<br /><strong>Working together.</strong></p><div>{["Connect", "Propose", "Deliver", "Invoice"].map((step, index) => <span key={step}>{step}{index < 3 ? <ArrowRight size={17} aria-hidden="true" /> : <CheckCheck size={18} aria-hidden="true" />}</span>)}</div></div>
      <section className={styles.features} id="features">
        <div className={styles.sectionHeading}><div><p>The complete picture</p><h2>A home for the work<br />behind your best work.</h2></div><p>Less switching between scattered tools.<br />More context, from start to finish.</p></div>
        <div className={styles.featureGrid}>{capabilities.map(({ icon: Icon, title, copy, label, tags }) => <article className={styles.feature} key={label}><span className={styles.featureIcon}><Icon size={24} aria-hidden="true" /></span><p className={styles.featureLabel}>{label}</p><h3>{title}</h3><p>{copy}</p><div className={styles.tags}>{tags.map(tag => <span key={tag}>{tag}</span>)}</div></article>)}</div>
      </section>
      <section className={styles.clientSection} id="client-experience">
        <div className={styles.clientVisual} aria-label="Illustration of the client portal">
          <div className={styles.clientMiniTop}><span><Users size={18} /> Client portal</span><span>Sample view</span></div>
          <h3>A little clarity goes a long way.</h3><p>Your project. Your documents. All together.</p>
          {[{ icon: FolderKanban, title: "Project milestones", detail: "See how the work is moving forward" }, { icon: FileText, title: "Proposals & invoices", detail: "Find the details, without the back-and-forth" }, { icon: Paperclip, title: "Shared files", detail: "Keep the latest deliverables close" }].map(({icon: Icon, title, detail}) => <div className={styles.clientRow} key={title}><Icon size={20} aria-hidden="true" /><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={16} aria-hidden="true" /></div>)}
        </div>
        <div className={styles.clientCopy}><span className={styles.intro}>Made for your clients, too</span><h2>Make every touchpoint<br />feel considered.</h2><p>Give clients a dedicated place to follow their projects, review proposals and access shared files and invoices. A polished experience that reflects the care you put into your work.</p><ul><li><Check size={17} /> Clear project visibility</li><li><Check size={17} /> Documents in one place</li><li><ShieldCheck size={17} /> Access shaped by existing permissions</li></ul><Link href="/signup">Build a better client experience <ArrowRight size={17} aria-hidden="true" /></Link></div>
      </section>
      <section className={styles.cta}><div><span>Bring it all together.</span><h2>Your next chapter,<br />a little more organized.</h2></div><div><Link className={styles.primary} href="/signup">Get started with OmixDesk <Plus size={17} aria-hidden="true" /></Link><p>Already have a workspace? <Link href="/login">Sign in</Link></p></div></section>
    </main>
    <footer className={styles.footer}><Link href="/" className={styles.brand}><BrandMark /><span>OmixDesk</span></Link><p>Agency operations, thoughtfully connected.</p><span>By Omix Solutions</span></footer>
  </div>;
}
