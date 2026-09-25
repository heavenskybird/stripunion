import React from 'react';
import { Link } from 'react-router-dom';

const nav = [
  ['Live Cams','/live-cams'],['Hentai / Anime','/hentai-anime'],
  ['Adult Games','/adult-games'],['VR / AR','/vr-ar'],
  ['Dating / Hookups','/dating-hookups'],['Premium Videos','/premium-videos'],
  ['Free Videos','/free-videos'],['Adult Shops','/adult-shops']
];

export default function Layout({ children }) {
  return (
    <>
      <header className="site-header">
        <div className="shell header-row">
          <Link className="brand" to="/">StripUnion</Link>
          <nav>
            {nav.map(([name, path]) => <Link key={path} to={path}>{name}</Link>)}
            <a href="https://blog.stripunion.com">Blog</a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div className="shell footer-grid">
          <div>
            <strong>StripUnion</strong>
            <p>Independent adult-platform reviews and comparisons for adults 18+.</p>
          </div>
          <div>
            <Link to="/about">About</Link>
            <Link to="/editorial-policy">Editorial Policy</Link>
            <Link to="/affiliate-disclosure">Affiliate Disclosure</Link>
          </div>
          <div>
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
        <div className="shell footer-note">
          18+ only. StripUnion may earn commissions from qualifying referrals.
        </div>
      </footer>
    </>
  );
}