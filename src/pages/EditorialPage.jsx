import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { STRIPCHAT_AFFILIATE_URL, AFFILIATE_REL } from '../config/affiliate';

const names = {
  stripchat:'Stripchat', chaturbate:'Chaturbate', livejasmin:'LiveJasmin',
  brazzers:'Brazzers', adultfriendfinder:'AdultFriendFinder', pornhub:'Pornhub',
  xvideos:'XVideos', xhamster:'xHamster', vrporn:'VRPorn', sexlikereal:'SexLikeReal',
  nutaku:'Nutaku', lewdgames:'LewdGames', f95zone:'F95Zone', fakku:'FAKKU',
  nhentai:'nHentai', lovehoney:'Lovehoney', 'adam-and-eve':'Adam & Eve',
  'ashley-madison':'Ashley Madison', bongacams:'BongaCams', czechvr:'CzechVR',
  'reality-kings':'Reality Kings', 'naughty-america':'Naughty America',
  pinkcherry:'PinkCherry', 'hentai-haven':'Hentai Haven', friendfinderx:'FriendFinder-X'
};

function titleFromPath(path) {
  const slug = path.split('/').filter(Boolean)[0] || '';
  return names[slug] || slug.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
}

export default function EditorialPage() {
  const { pathname } = useLocation();
  const title = titleFromPath(pathname);
  const isStripchat = pathname.startsWith('/stripchat');

  return (
    <section className="section shell article">
      <div className="crumb"><Link to="/">Home</Link> / Review</div>
      <span className="eyebrow dark">StripUnion editorial guide</span>
      <h1>{title}</h1>
      <p className="lede">
        This page is being migrated from the original StripUnion editorial library into the new
        codebase. Existing useful content and public URLs are being preserved while template residue
        and misleading commercial links are removed.
      </p>
      <div className="disclosure">
        <strong>Affiliate disclosure:</strong> StripUnion may earn a commission from qualifying
        referrals. Editorial coverage and commercial partner links are presented separately.
      </div>
      <h2>What to evaluate</h2>
      <p>
        When comparing adult platforms, focus on the business model, free-access options, pricing
        structure, mobile usability, privacy and safety information, content breadth and whether the
        experience matches what you are looking for.
      </p>
      <h2>Current partner option</h2>
      <p>
        {isStripchat
          ? 'Stripchat is currently our approved affiliate partner.'
          : 'We do not currently have an approved affiliate relationship with this reviewed platform. Our current partner alternative is Stripchat.'}
      </p>
      <a className="btn primary" href={STRIPCHAT_AFFILIATE_URL} target="_blank" rel={AFFILIATE_REL}>
        Try Stripchat →
      </a>
      <p className="micro">
        Commercial affiliate link. This button does not imply an affiliation with {title}
        unless the page itself is about Stripchat.
      </p>
    </section>
  );
}