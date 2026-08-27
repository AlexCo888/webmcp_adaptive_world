import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Fingerprint,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="page-wrap hero">
      <section className="hero__grid" aria-labelledby="hero-title">
        <div className="hero__copy">
          <div>
            <p className="eyebrow">Your context, in motion</p>
            <h1 className="display-title" id="hero-title">
              A gym that can <em>meet you</em> where you are.
            </h1>
            <p className="page-intro">
              Bring a minimum, consented view from your Digital Passport. Adaptive Gym matches it to
              the equipment, space and accessibility features that are actually here.
            </p>
          </div>
          <div className="hero__actions">
            <Link href="/passport" className="button button--dark">
              Connect demo context <Fingerprint size={18} />
            </Link>
            <Link href="/equipment" className="button button--light">
              Explore 68 machines <ArrowRight size={18} />
            </Link>
          </div>
        </div>
        <div className="hero__visual" aria-label="Catalog grounding illustration">
          <span className="tag tag--green">
            <Sparkles size={13} /> Live WebMCP surface
          </span>
          <div className="hero__figure" aria-hidden="true">
            <div className="hero__ring" />
          </div>
          <div className="hero__metric">
            <strong>68</strong>
            <span>real catalog entries available for grounded session planning</span>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Adaptive Gym product principles">
        <div className="proof-item">
          <span className="proof-item__icon">
            <Fingerprint size={19} />
          </span>
          <div>
            <strong>Minimum necessary context</strong>
            <p>No identity, medications or lab values are sent to the gym.</p>
          </div>
        </div>
        <div className="proof-item">
          <span className="proof-item__icon">
            <Boxes size={19} />
          </span>
          <div>
            <strong>Catalog-grounded planning</strong>
            <p>Every recommendation resolves to a machine in this facility.</p>
          </div>
        </div>
        <div className="proof-item">
          <span className="proof-item__icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <strong>Human confirmation</strong>
            <p>You review context and approve changes before anything is recorded.</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="how-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Understand → Match → Act</p>
            <h2 className="section-title" id="how-heading">
              From context to a useful session.
            </h2>
          </div>
          <p className="page-intro">
            The ordinary interface works on its own. WebMCP adds a structured, agent-readable layer
            without bypassing your choices.
          </p>
        </div>
        <div className="steps">
          <article className="card step-card">
            <span className="step-card__number">01</span>
            <div>
              <h3>Connect a projection</h3>
              <p>
                Select one of six synthetic Passport profiles or redeem a short-lived context grant.
              </p>
            </div>
          </article>
          <article className="card step-card">
            <span className="step-card__number">02</span>
            <div>
              <h3>Match what exists</h3>
              <p>
                Search the structured equipment catalog by goal, movement, accessibility or physical
                footprint.
              </p>
            </div>
          </article>
          <article className="card step-card">
            <span className="step-card__number">03</span>
            <div>
              <h3>Adapt with feedback</h3>
              <p>Generate a draft, review every choice and record how the session actually felt.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="section home-cta">
        <div>
          <p className="eyebrow">Built for real environments</p>
          <h2 className="section-title">The useful intelligence is in the match.</h2>
        </div>
        <Link className="button button--lime" href="/session">
          Build a grounded session <SlidersHorizontal size={17} />
        </Link>
      </section>
    </div>
  );
}
