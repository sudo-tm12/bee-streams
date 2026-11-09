import '@fontsource-variable/manrope';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, createBrowserRouter, useParams } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppLayout, Root } from './components/Layout';
import { ToastProvider } from './components/Toasts';
import { BrowsePage } from './pages/BrowsePage';
import { HomePage } from './pages/HomePage';
import { MovieDetailPage } from './pages/MovieDetailPage';
import { MyListPage } from './pages/MyListPage';
import { PersonPage } from './pages/PersonPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { TvDetailPage } from './pages/TvDetailPage';
import { WatchPage } from './pages/WatchPage';

/** Old v1 links like /watch/tv/123 (no season) → first episode. */
function LegacyTvWatch() {
  const { id } = useParams();
  return <Navigate to={`/watch/tv/${id}/1/1`} replace />;
}

// "/" in the desktop app, "/bee-streams" on GitHub Pages.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'movies', element: <BrowsePage mediaType="movie" key="movie" /> },
          { path: 'tv', element: <BrowsePage mediaType="tv" key="tv" /> },
          { path: 'tv-shows', element: <Navigate to="/tv" replace /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'movie/:id', element: <MovieDetailPage /> },
          { path: 'tv/:id', element: <TvDetailPage /> },
          { path: 'person/:id', element: <PersonPage /> },
          { path: 'my-list', element: <MyListPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
      { path: 'watch/movie/:id', element: <WatchPage mediaType="movie" key="movie" /> },
      { path: 'watch/tv/:id/:season/:episode', element: <WatchPage mediaType="tv" key="tv" /> },
      { path: 'watch/tv/:id', element: <LegacyTvWatch /> },
    ],
  },
], { basename });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </StrictMode>,
);
