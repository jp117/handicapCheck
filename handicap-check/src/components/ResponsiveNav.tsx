'use client';

import { useState } from 'react';
import Link from 'next/link';
import AuthNav from './AuthNav';

export default function ResponsiveNav() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Desktop Navigation */}
          <div className="flex">
            <div className="hidden md:flex flex-shrink-0 items-center space-x-6">
              <Link href="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">
                Handicap Check
              </Link>
              <Link href="/tournament-check" className="text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                Tournament Check
              </Link>
              <Link href="/score-check" className="text-gray-700 hover:text-indigo-600 font-medium transition-colors">
                Score Check
              </Link>
            </div>
            
            {/* Mobile Hamburger Button and Logo */}
            <div className="md:hidden flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors mr-4">
                Handicap Check
              </Link>
              <button
                onClick={toggleMenu}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                aria-expanded="false"
              >
                <span className="sr-only">Open main menu</span>
                {/* Hamburger icon */}
                <svg
                  className={`${isMenuOpen ? 'hidden' : 'block'} h-6 w-6`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                {/* Close icon */}
                <svg
                  className={`${isMenuOpen ? 'block' : 'hidden'} h-6 w-6`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* Auth Navigation - Always visible */}
          <div className="flex items-center">
            <AuthNav />
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden`}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-gray-50 border-t border-gray-200">
          <Link
            href="/"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-indigo-600 hover:bg-gray-100 transition-colors"
            onClick={() => setIsMenuOpen(false)}
          >
            Home
          </Link>
          <Link
            href="/tournament-check"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-indigo-600 hover:bg-gray-100 transition-colors"
            onClick={() => setIsMenuOpen(false)}
          >
            Tournament Check
          </Link>
          <Link
            href="/score-check"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-indigo-600 hover:bg-gray-100 transition-colors"
            onClick={() => setIsMenuOpen(false)}
          >
            Score Check
          </Link>
        </div>
      </div>
    </nav>
  );
} 