import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import EditorialPage from './pages/EditorialPage';
import StaticPage from './pages/StaticPage';
import { legacyPaths } from './data/site';

const staticPaths = [
  '/about','/editorial-policy','/affiliate-disclosure','/privacy-policy',
  '/terms','/contact','/age-verification','/disclaimer'
];

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/categories" element={<Home />} />
        <Route path="/blog" element={<Navigate to="https://blog.stripunion.com" replace />} />
        {staticPaths.map(path => <Route key={path} path={path} element={<StaticPage />} />)}
        {legacyPaths.map(path => <Route key={path} path={path} element={<EditorialPage />} />)}
        <Route path="/page2" element={<Navigate to="/categories" replace />} />
        <Route path="/page3" element={<Navigate to="/categories" replace />} />
        <Route path="*" element={
          <section className="section shell article">
            <h1>Page not found</h1>
            <p>The page may have moved during the StripUnion migration.</p>
          </section>
        } />
      </Routes>
    </Layout>
  );
}