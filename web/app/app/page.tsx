'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Search,
  Zap,
  Shield,
  Code,
  BarChart3,
  Play,
  ArrowRight,
  GitBranch,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import BrandLogo, { BrandName } from './components/BrandLogo';
import LandingHeroPreview from './components/LandingHeroPreview';

export default function HomePage() {
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="rounded-xl bg-slate-800/80 p-1.5 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10">
                <BrandLogo size={36} />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">{BrandName}</h1>
            </div>
            <nav className="hidden lg:flex items-center space-x-8">
              <a href="/dashboard" className="text-slate-300 hover:text-white transition-colors duration-200 font-medium">Dashboard</a>
              <a href="#features" className="text-slate-300 hover:text-white transition-colors duration-200 font-medium">Features</a>
              <a href="#docs" className="text-slate-300 hover:text-white transition-colors duration-200 font-medium">Documentation</a>
              <button 
                onClick={() => router.push('/dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Open Dashboard
              </button>
            </nav>
            <div className="flex items-center gap-2 lg:hidden">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700"
              >
                Dashboard
              </button>
              <button
                type="button"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-nav-menu"
                onClick={() => setMobileNavOpen((o) => !o)}
                className="rounded-lg border border-slate-600 p-2.5 text-slate-200 hover:bg-slate-800"
              >
                {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
          {mobileNavOpen ? (
            <nav
              id="mobile-nav-menu"
              className="mt-4 flex flex-col gap-1 border-t border-slate-700/60 pt-4 lg:hidden"
            >
              <a
                href="#features"
                className="rounded-lg px-3 py-2.5 text-slate-200 hover:bg-slate-800"
                onClick={() => setMobileNavOpen(false)}
              >
                Features
              </a>
              <a
                href="#docs"
                className="rounded-lg px-3 py-2.5 text-slate-200 hover:bg-slate-800"
                onClick={() => setMobileNavOpen(false)}
              >
                Documentation
              </a>
              <a
                href="/dashboard"
                className="rounded-lg px-3 py-2.5 text-slate-200 hover:bg-slate-800"
                onClick={() => setMobileNavOpen(false)}
              >
                Open full dashboard
              </a>
            </nav>
          ) : null}
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto min-w-0 px-8 py-24">
        <div className="mx-auto max-w-6xl min-w-0 text-center">
          <div className="mb-12 flex flex-col items-center justify-center gap-6 md:flex-row md:gap-0 md:ml-0">
            <span className="rounded-3xl bg-slate-800/60 p-3 ring-2 ring-blue-400/35 shadow-2xl shadow-blue-500/15">
              <BrandLogo size={96} />
            </span>
            <div className="text-center md:text-left md:ml-6">
              <h1 className="text-6xl lg:text-8xl font-black text-white mb-4 tracking-tight leading-tight">
                {BrandName}
              </h1>
              <p className="text-3xl lg:text-4xl text-blue-400 font-bold tracking-wide">Professional Java Refactoring Suite</p>
            </div>
          </div>
          
          <p className="text-2xl text-slate-300 mb-16 leading-relaxed max-w-4xl mx-auto font-light">
            Transform your Java codebase with AI-powered analysis. Identify code smells, 
            plan refactoring strategies, and safely apply transformations with our 
            assessment-first workflow.
          </p>

          <LandingHeroPreview />

          {/* Dashboard Access Message */}
          <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-2xl p-6 mb-16 max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center mb-3">
              <BarChart3 className="w-8 h-8 text-blue-400 mr-3" />
              <h3 className="text-xl font-bold text-blue-400">Enhanced Dashboard Available!</h3>
            </div>
            <p className="text-slate-300 text-lg mb-4">
              Our professional Code Analysis Dashboard is ready with individual file analysis, code smell detection, and AI-powered refactoring.
            </p>
            <button 
              onClick={() => router.push('/dashboard')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-semibold transition-all duration-200 transform hover:scale-105 border border-blue-400/50"
            >
              Access Dashboard Now
            </button>
          </div>
          
          <div className="mb-20 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center sm:space-x-6 sm:gap-0">
            <button 
              onClick={() => router.push('/dashboard')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-5 sm:px-12 sm:py-6 rounded-2xl text-lg sm:text-2xl font-bold transition-all duration-300 transform hover:scale-105 shadow-2xl hover:shadow-blue-500/25 flex items-center justify-center group border-2 border-blue-400/50"
            >
              <BarChart3 size={28} className="mr-3 shrink-0 sm:mr-4 sm:h-8 sm:w-8" />
              Go to Dashboard
              <ArrowRight size={24} className="ml-3 shrink-0 group-hover:translate-x-1 transition-transform duration-200 sm:ml-4 sm:h-7 sm:w-7" />
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex items-center justify-center bg-slate-700 px-8 py-5 text-lg font-bold text-white shadow-xl transition-all duration-300 hover:scale-105 hover:bg-slate-600 sm:px-10 sm:text-xl rounded-2xl"
            >
              <Play size={24} className="mr-3 shrink-0 sm:h-7 sm:w-7" />
              Quick Demo
            </button>
          </div>

          {/* Auto-redirect Message */}
          {/* Removed auto-redirect message as per edit hint */}
          
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-8 py-24">
        <div className="text-center mb-20">
          <h2 className="text-5xl font-black text-white mb-8 tracking-tight">Why Choose {BrandName}?</h2>
          <p className="text-2xl text-slate-300 max-w-4xl mx-auto font-light leading-relaxed">
            Professional-grade tools designed for enterprise Java development teams
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-10">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-10 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 transform hover:scale-105 group">
            <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-blue-500/20 transition-all duration-300">
              <Search className="text-blue-400" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-6">Assessment-First</h3>
            <p className="text-slate-300 leading-relaxed text-lg font-light">
              Analyze code quality before making changes with comprehensive smell detection and metrics analysis.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-10 border border-slate-700/50 hover:border-emerald-500/50 transition-all duration-300 transform hover:scale-105 group">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-emerald-500/20 transition-all duration-300">
              <Code className="text-emerald-400" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-6">Plugin Architecture</h3>
            <p className="text-slate-300 leading-relaxed text-lg font-light">
              Extensible detectors and transforms via SPI for custom refactoring rules and enterprise needs.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-10 border border-slate-700/50 hover:border-amber-500/50 transition-all duration-300 transform hover:scale-105 group">
            <div className="w-20 h-20 bg-amber-500/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-amber-500/20 transition-all duration-300">
              <Shield className="text-amber-400" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-6">Enterprise Security</h3>
            <p className="text-slate-300 leading-relaxed text-lg font-light">
              All processing happens locally by default with no code sent externally. Perfect for sensitive codebases.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-10 border border-slate-700/50 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-105 group">
            <div className="w-20 h-20 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-purple-500/20 transition-all duration-300">
              <Zap className="text-purple-400" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-6">Deterministic Results</h3>
            <p className="text-slate-300 leading-relaxed text-lg font-light">
              Same input produces same output with version-pinned formatters and consistent analysis.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-10 border border-slate-700/50 hover:border-red-500/50 transition-all duration-300 transform hover:scale-105 group">
            <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-red-500/20 transition-all duration-300">
              <BarChart3 className="text-red-400" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-6">Multiple Interfaces</h3>
            <p className="text-slate-300 leading-relaxed text-lg font-light">
              CLI, Web UI, and VS Code extension for different workflow preferences and team needs.
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-10 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 transform hover:scale-105 group">
            <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-8 group-hover:bg-blue-500/20 transition-all duration-300">
              <GitBranch className="text-blue-400" size={40} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-6">Git Integration</h3>
            <p className="text-slate-300 leading-relaxed text-lg font-light">
              Direct analysis of Git repositories with branch and commit support for modern workflows.
            </p>
          </div>
        </div>
      </section>

      <section id="docs" className="container mx-auto px-8 py-16">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-700/50 bg-slate-800/40 p-10 backdrop-blur-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15">
              <FileText className="text-blue-400" size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tight text-white">Documentation</h2>
              <p className="text-slate-400">Research methodology, metric definitions, and reporting.</p>
            </div>
          </div>
          <ul className="space-y-4 text-left text-slate-300">
            <li>
              <span className="font-semibold text-white">Research methodology</span> — see project documentation for study design, threats to validity, and how results are interpreted.
            </li>
            <li>
              <span className="font-semibold text-white">Metric &amp; smell computation</span> — see{' '}
              <code className="rounded bg-slate-900/80 px-2 py-0.5 text-sm text-emerald-300">wiki/Metric-and-Smell-Computation-Reference.md</code>{' '}
              for formulas, caps, Java vs Python paths, and CSV column semantics used in exports.
            </li>
            <li>
              <span className="font-semibold text-white">Live workflow</span> — open the{' '}
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="font-semibold text-blue-400 underline decoration-blue-400/40 underline-offset-4 hover:text-blue-300"
              >
                dashboard
              </button>{' '}
              for file-level analysis, before/after charts, and CSV export from the refactoring review.
            </li>
          </ul>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-8 py-24">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-3xl p-16 text-center border border-slate-700/50 shadow-2xl">
          <h2 className="text-4xl font-black text-white mb-16 tracking-tight">Trusted by Development Teams</h2>
          <div className="grid md:grid-cols-4 gap-12">
            <div>
              <div className="text-6xl font-black text-blue-400 mb-4">500+</div>
              <div className="text-xl text-slate-300 font-medium">Projects Analyzed</div>
            </div>
            <div>
              <div className="text-6xl font-black text-emerald-400 mb-4">10M+</div>
              <div className="text-xl text-slate-300 font-medium">Lines of Code</div>
            </div>
            <div>
              <div className="text-6xl font-black text-amber-400 mb-4">99.9%</div>
              <div className="text-xl text-slate-300 font-medium">Uptime</div>
            </div>
            <div>
              <div className="text-6xl font-black text-purple-400 mb-4">24/7</div>
              <div className="text-xl text-slate-300 font-medium">Support</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-8 py-16">
          <div className="grid md:grid-cols-4 gap-12">
            <div>
              <div className="mb-6 flex items-center space-x-4">
                <span className="rounded-lg bg-slate-800/80 p-1 ring-1 ring-slate-600/50">
                  <BrandLogo size={40} />
                </span>
                <span className="text-2xl font-bold text-white">{BrandName}</span>
              </div>
              <p className="text-slate-400 text-lg font-light leading-relaxed">
                Professional Java refactoring suite for enterprise development teams.
              </p>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-6">Product</h3>
              <ul className="space-y-3 text-slate-400">
                <li><a href="/dashboard" className="hover:text-white transition-colors duration-200 font-medium">Dashboard</a></li>
                <li><a href="#features" className="hover:text-white transition-colors duration-200 font-medium">Features</a></li>
                <li><a href="#docs" className="hover:text-white transition-colors duration-200 font-medium">Documentation</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-6">Support</h3>
              <ul className="space-y-3 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors duration-200 font-medium">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200 font-medium">Contact Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200 font-medium">Status</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-bold text-lg mb-6">Company</h3>
              <ul className="space-y-3 text-slate-400">
                <li><a href="#" className="hover:text-white transition-colors duration-200 font-medium">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200 font-medium">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200 font-medium">Careers</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700/50 mt-12 pt-12 text-center text-slate-500">
            <p className="text-lg">© 2026 {BrandName}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
