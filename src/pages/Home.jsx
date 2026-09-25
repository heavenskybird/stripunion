import React from 'react';
import { Link } from 'react-router-dom';
import { categories } from '../data/site';
import { STRIPCHAT_AFFILIATE_URL, AFFILIATE_REL } from '../config/affiliate';

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="shell hero-inner">
          <span className="eyebrow">Independent reviews · transparent affiliate disclosure · 18+</span>
          <h1>Find adult platforms that fit what you actually want.</h1>
          <p>
            StripUnion organizes reviews, comparisons and category guides so you can compare
            platform models, usability, privacy considerations and value before leaving our site.
          </p>
          <div className="actions">
            <a className="btn primary" href={STRIPCHAT_AFFILIATE_URL} target="_blank" rel={AFFILIATE_REL}>
              Try Stripchat →
            </a>
            <Link className="btn secondary" to="/categories">Browse reviews</Link>
          </div>
          <small>
            Affiliate disclosure: we may earn a commission from qualifying referrals, at no extra cost to you.
          </small>
        </div>
      </section>

      <section className="section shell">
        <div className="section-head">
          <span>Discover</span>
          <h2>Explore by category</h2>
          <p>Start with the experience you are looking for, then drill into reviews and comparisons.</p>
        </div>
        <div className="cards">
          {categories.map(([name, path, description]) => (
            <Link className="card" to={path} key={path}>
              <h3>{name}</h3>
              <p>{description}</p>
              <span>Explore →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section soft">
        <div className="shell trust">
          <div>
            <span className="eyebrow dark">How we review</span>
            <h2>Editorial first, commercial links clearly separated.</h2>
          </div>
          <div>
            <p>
              We structure reviews around practical decision factors such as pricing model,
              free-access options, usability, mobile experience, privacy and safety information,
              content breadth and value.
            </p>
            <p>
              Commercial partner links are labeled separately from editorial links.
              We do not publish fabricated user ratings, review counts or testing claims.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}