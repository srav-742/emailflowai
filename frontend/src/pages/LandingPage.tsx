import { useState } from 'react';
import { Mail, Zap, BarChart3, Shield, Clock, Bot } from 'lucide-react';

export function LandingPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Connect to signup endpoint
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="border-b border-slate-700/50 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Mail className="w-6 h-6 text-blue-500" />
              <span className="text-xl font-bold text-white">EmailAI</span>
            </div>
            <div className="hidden md:flex gap-8">
              <a href="#features" className="text-slate-300 hover:text-white transition">Features</a>
              <a href="#benefits" className="text-slate-300 hover:text-white transition">Benefits</a>
              <a href="#pricing" className="text-slate-300 hover:text-white transition">Pricing</a>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/api/auth/google';
              }}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
            >
              Login with Google
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold text-white leading-tight">
                Your Email,
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"> Supercharged</span>
              </h1>
              <p className="text-xl text-slate-300 leading-relaxed">
                AI-powered email management that saves you hours every week. Focus on what matters, not your inbox.
              </p>
            </div>

            {/* CTA Form */}
            <form onSubmit={handleGetStarted} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition"
                required
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {isLoading ? 'Starting...' : 'Get Started'}
              </button>
            </form>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-slate-700/50">
              <div>
                <p className="text-2xl font-bold text-blue-400">10k+</p>
                <p className="text-sm text-slate-400">Active Users</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-cyan-400">15h</p>
                <p className="text-sm text-slate-400">Saved Weekly</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">98%</p>
                <p className="text-sm text-slate-400">Satisfaction</p>
              </div>
            </div>
          </div>

          {/* Right Visual */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 blur-3xl rounded-full"></div>
            <div className="relative bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-2xl p-8 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-slate-700/30 rounded-lg">
                <Zap className="w-5 h-5 text-yellow-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Smart Inbox</p>
                  <p className="text-xs text-slate-400">Auto-organized by priority</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-700/30 rounded-lg">
                <Bot className="w-5 h-5 text-blue-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">AI Drafts</p>
                  <p className="text-xs text-slate-400">Generate responses in seconds</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-700/30 rounded-lg">
                <BarChart3 className="w-5 h-5 text-green-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Analytics</p>
                  <p className="text-xs text-slate-400">Track productivity metrics</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-slate-700/30 rounded-lg">
                <Shield className="w-5 h-5 text-purple-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Secure</p>
                  <p className="text-xs text-slate-400">Bank-level encryption</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Powerful Features</h2>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">
            Everything you need to master your inbox and reclaim your time
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            {
              icon: Zap,
              title: 'Smart Inbox',
              description: 'AI automatically categorizes emails by importance and urgency so you see what matters first.'
            },
            {
              icon: Bot,
              title: 'AI Copilot',
              description: 'Generate professional responses, summaries, and follow-ups powered by advanced AI.'
            },
            {
              icon: BarChart3,
              title: 'Analytics Dashboard',
              description: 'Track response time, productivity score, and email metrics in real-time.'
            },
            {
              icon: Clock,
              title: 'Time Tracking',
              description: 'See exactly how much time EmailAI saves you every week with detailed reports.'
            },
            {
              icon: Mail,
              title: 'Multi-Account',
              description: 'Manage multiple email accounts from Gmail, Outlook, and more in one place.'
            },
            {
              icon: Shield,
              title: 'Enterprise Security',
              description: 'Bank-level encryption and GDPR compliant with automatic data protection.'
            }
          ].map((feature, i) => (
            <div key={i} className="group bg-slate-800/50 backdrop-blur border border-slate-700/50 hover:border-blue-500/50 rounded-xl p-6 transition duration-300 hover:shadow-xl hover:shadow-blue-500/10">
              <feature.icon className="w-8 h-8 text-blue-400 mb-4 group-hover:scale-110 transition" />
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <h2 className="text-4xl font-bold text-white">Why Teams Love EmailAI</h2>
            {[
              { title: '↓ 15 hours saved', subtitle: 'Per week on average' },
              { title: '↑ 3x faster', subtitle: 'Response time vs. manual' },
              { title: '99.9% uptime', subtitle: 'Enterprise-grade reliability' },
              { title: '24/7 support', subtitle: 'Priority support for all users' }
            ].map((item, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold">✓</span>
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">{item.title}</p>
                  <p className="text-slate-400">{item.subtitle}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-xl p-8 text-center">
              <p className="text-4xl font-bold text-blue-400 mb-2">10,000+</p>
              <p className="text-slate-300">Teams using EmailAI</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <p className="text-2xl font-bold text-white">4.9★</p>
              <p className="text-sm text-slate-400">Rating on ProductHunt</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <p className="text-2xl font-bold text-white">SOC2</p>
              <p className="text-sm text-slate-400">Compliance Certified</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-white mb-4">Simple, Transparent Pricing</h2>
          <p className="text-slate-300 text-lg">Choose the plan that fits your needs</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { name: 'Free', price: '$0', features: ['1 email account', 'Basic inbox management', 'Community support'] },
            { name: 'Pro', price: '$29', features: ['Unlimited accounts', 'AI copilot (100 msgs/mo)', 'Priority support'], highlight: true },
            { name: 'Enterprise', price: 'Custom', features: ['Everything in Pro', 'Unlimited AI usage', 'Dedicated support'] }
          ].map((plan, i) => (
            <div key={i} className={`rounded-xl border transition ${plan.highlight ? 'bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border-blue-500/50 shadow-xl shadow-blue-500/20 scale-105' : 'bg-slate-800/30 border-slate-700/50'} p-8`}>
              {plan.highlight && <span className="inline-block bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">MOST POPULAR</span>}
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
              <p className="text-slate-300 mb-6">{plan.price}<span className="text-sm text-slate-400">/month</span></p>
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-center gap-2 text-slate-300">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button className={`w-full py-3 rounded-lg font-semibold transition ${plan.highlight ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700' : 'bg-slate-700 text-white hover:bg-slate-600'}`}>
                Get Started
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="relative bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent"></div>
          <div className="relative px-8 py-16 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Transform Your Email?</h2>
            <p className="text-slate-300 text-lg mb-8">Join thousands of professionals saving hours every week</p>
            <button className="px-8 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-lg transition shadow-lg shadow-blue-500/30">
              Start Free Trial
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-slate-900/50 mt-20 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-blue-500" />
                <span className="font-bold text-white">EmailAI</span>
              </div>
              <p className="text-slate-400 text-sm">AI-powered email management for modern teams</p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Security', 'Roadmap'] },
              { title: 'Company', links: ['About', 'Blog', 'Careers', 'Contact'] },
              { title: 'Legal', links: ['Privacy', 'Terms', 'GDPR', 'Compliance'] }
            ].map((col, i) => (
              <div key={i}>
                <h4 className="font-semibold text-white mb-4">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((link, j) => (
                    <li key={j}><a href="#" className="text-slate-400 hover:text-white text-sm transition">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-700/50 pt-8 flex flex-col md:flex-row justify-between items-center text-slate-400 text-sm">
            <p>&copy; 2026 EmailAI. All rights reserved.</p>
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-white transition">Twitter</a>
              <a href="#" className="hover:text-white transition">LinkedIn</a>
              <a href="#" className="hover:text-white transition">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
