import { useState } from 'react'
import { createBrowserRouter, Link, Navigate, NavLink, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { AudioLines, LayoutDashboard, LogOut, Music2, Settings2, Users } from 'lucide-react'
import { supabase } from '../shared/client'
import { Feedback, Loading } from '../shared/ui'
import { AuthProvider, useAuth, AuthScreen, Welcome, signOut } from '../features/identity/public'
import { ProfileProvider, useProfile, Settings } from '../features/profiles/public'
import { Preferences } from '../features/preferences/public'
import { Compare } from '../features/comparison/public'
import { Dashboard, ResultScreen } from '../features/results/public'

function Shell() {
  const { user, loading } = useAuth()
  const [error, setError] = useState('')
  return <><a className="skip-link" href="#main">Skip to content</a><header className="topbar"><Link className="brand" to="/"><span className="brand-mark"><AudioLines size={22} /></span><span>party<span className="brand-light">music</span><small>MATCHER</small></span></Link>
    {user ? <><nav aria-label="Main navigation"><NavLink aria-label="Overview" to="/dashboard"><LayoutDashboard size={17} /><span>Overview</span></NavLink><NavLink aria-label="My rotation" to="/preferences"><Music2 size={17} /><span>My rotation</span></NavLink><NavLink aria-label="Compare" to="/compare"><Users size={17} /><span>Compare</span></NavLink><NavLink aria-label="Settings" to="/settings"><Settings2 size={17} /><span>Settings</span></NavLink></nav><button className="icon-button" aria-label="Sign out" onClick={() => void signOut().then(r => { if (r.error) setError(r.error.message) })}><LogOut size={18} /></button></> : <div className="actions"><Link to="/login" className="nav-login">Sign in</Link><Link className="button compact" to="/signup">Get started <span aria-hidden="true">↗</span></Link></div>}
  </header><main id="main"><Feedback>{error}</Feedback>{loading ? <Loading /> : <Outlet />}</main><footer className="site-footer"><span>Made for music. Built for connection.</span><span>No streaming account. Just good taste.</span></footer></>
}
function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return <ProfileProvider key={user.id}><ProfileGate /></ProfileProvider>
}
function ProfileGate() {
  const { profile, loading, error, reload } = useProfile()
  const location = useLocation()
  if (loading) return <Loading />
  if (error) return <section className="panel"><Feedback>{error}</Feedback><button onClick={() => void reload()}>Retry profile</button></section>
  if (!profile && location.pathname !== '/settings') return <Navigate to="/settings" replace />
  return <Outlet />
}
function Setup() {
  return <div className="setup narrow"><span className="brand-mark"><AudioLines size={24} /></span><h1>Your music space is almost ready.</h1><p>This application needs a Supabase connection. No demo data or pretend saves are used.</p><ol><li>Start a local Supabase project or use an approved hosted project.</li><li>Apply the included database migration.</li><li>Copy <code>.env.example</code> to <code>.env</code> and set your project URL and publishable key.</li><li>Restart the development server.</li></ol><p>See the project README for complete setup and deployment steps.</p></div>
}
const router = createBrowserRouter([{
  element: <Shell />,
  errorElement: <div className="setup narrow"><h1>This track skipped.</h1><p>The page encountered an unexpected error. Reload before retrying any unsaved changes.</p><a href="/">Return home</a></div>,
  children: [
    { path: '/', element: <Welcome /> },
    ...(['login', 'signup', 'recover'] as const).map(mode => ({ path: `/${mode}`, element: <AuthScreen key={mode} mode={mode} /> })),
    { path: '/reset-password', element: <AuthScreen mode="reset" /> },
    { element: <Protected />, children: [
      { path: '/dashboard', element: <Dashboard /> }, { path: '/settings', element: <Settings /> },
      { path: '/preferences', element: <Preferences /> }, { path: '/compare', element: <Compare /> },
      { path: '/comparisons/:id', element: <ResultScreen /> },
    ] },
    { path: '*', element: <section className="panel"><h1>This track doesn’t exist.</h1><Link to="/">Back home</Link></section> },
  ],
}])
export function App() {
  if (!supabase) return <Setup />
  return <AuthProvider><RouterProvider router={router} /></AuthProvider>
}
