'use client'

import { useState } from 'react';

const TEES = [
  {
    label: "North Hills Men's Black",
    value: 'black',
    rating: 73.6,
    slope: 138,
  },
  {
    label: "North Hills Men's Blue",
    value: 'blue',
    rating: 72.1,
    slope: 136,
  },
  {
    label: "North Hills Men's Blue/White",
    value: 'bluewhite',
    rating: 71.6,
    slope: 134,
  },
  {
    label: "North Hills Men's White",
    value: 'white',
    rating: 71.0,
    slope: 131,
  },
  {
    label: 'Custom',
    value: 'custom',
    rating: '',
    slope: '',
  },
];

export default function ScoreCheckPage() {
  const [tee, setTee] = useState('black');
  const [slope, setSlope] = useState(TEES[0].slope);
  const [rating, setRating] = useState(TEES[0].rating);
  const [index, setIndex] = useState('');
  const [score, setScore] = useState('');
  const [par, setPar] = useState(72);
  const [results, setResults] = useState<null | {
    courseHandicap: number;
    netScore: number;
    zScore?: number;
  }>(null);

  const handleTeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = TEES.find(t => t.value === e.target.value);
    setTee(e.target.value);
    if (selected && selected.value !== 'custom') {
      setSlope(selected.slope);
      setRating(selected.rating);
      setPar(72);
    } else {
      setSlope('');
      setRating('');
      setPar(72);
    }
  };

  function getStdDevForIndex(indexNum: number): number {
    if (indexNum <= 0) return 2.0;
    if (indexNum <= 5) return 2.25;
    if (indexNum <= 10) return 2.75;
    if (indexNum <= 15) return 3.25;
    if (indexNum <= 20) return 3.75;
    if (indexNum <= 25) return 4.25;
    if (indexNum <= 30) return 4.75;
    return 5.25;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slope || !rating || !index || !score || !par) return;
    const slopeNum = Number(slope);
    const ratingNum = Number(rating);
    const indexNum = Number(index);
    const scoreNum = Number(score);
    const parNum = Number(par);
    // USGA Course Handicap formula
    const courseHandicap = Math.round(indexNum * (slopeNum / 113) + (ratingNum - parNum));
    const netScore = scoreNum - courseHandicap;
    let zScore: number | undefined = undefined;
    if (netScore < parNum) {
      const stddev = getStdDevForIndex(indexNum);
      zScore = (netScore - 72) / stddev;
    }
    setResults({ courseHandicap, netScore, zScore });
  };

  // Standard normal CDF
  function erf(x: number): number {
    // Approximation of the error function
    // Abramowitz and Stegun formula 7.1.26
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    const t = 1.0/(1.0 + p*x);
    const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
    return sign*y;
  }
  function normalCdf(z: number): number {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  return (
    <div className="max-w-xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4 text-gray-900">Score Check</h1>
      <form className="space-y-6 bg-white rounded shadow p-6" onSubmit={handleSubmit}>
        <div>
          <label className="block text-gray-900 font-medium mb-1">Tee</label>
          <select
            value={tee}
            onChange={handleTeeChange}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900"
          >
            {TEES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex space-x-4">
          <div className="flex-1">
            <label className="block text-gray-900 font-medium mb-1">Slope</label>
            <input
              type="number"
              value={slope}
              onChange={e => setSlope(e.target.value)}
              disabled={tee !== 'custom'}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900 bg-white"
              placeholder="Slope"
            />
          </div>
          <div className="flex-1">
            <label className="block text-gray-900 font-medium mb-1">Rating</label>
            <input
              type="number"
              step="0.1"
              value={rating}
              onChange={e => setRating(e.target.value)}
              disabled={tee !== 'custom'}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900 bg-white"
              placeholder="Rating"
            />
          </div>
        </div>
        <div className="flex space-x-4">
          <div className="flex-1">
            <label className="block text-gray-900 font-medium mb-1">Player&apos;s Index</label>
            <input
              type="number"
              value={index}
              onChange={e => setIndex(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900 bg-white"
              placeholder="Index"
            />
          </div>
          <div className="flex-1">
            <label className="block text-gray-900 font-medium mb-1">Player&apos;s Score</label>
            <input
              type="number"
              value={score}
              onChange={e => setScore(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900 bg-white"
              placeholder="Score"
            />
          </div>
        </div>
        <div>
          <label className="block text-gray-900 font-medium mb-1">Par</label>
          <input
            type="number"
            value={par}
            onChange={e => setPar(Number(e.target.value))}
            disabled={tee !== 'custom'}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm text-gray-900 bg-white"
            placeholder="Par"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 px-4 bg-indigo-600 text-white font-semibold rounded shadow hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          Calculate
        </button>
      </form>
      {results && (
        <div className="mt-8 bg-white rounded shadow p-6">
          <h2 className="text-lg font-bold mb-4 text-gray-900">Results</h2>
          <div className="text-gray-900 mb-2">Course Handicap: <span className="font-semibold">{results.courseHandicap}</span></div>
          <div className="text-gray-900 mb-2">Net Score: <span className="font-semibold">{results.netScore}</span></div>
          {results.zScore !== undefined && (
            <>
              <div className="text-gray-900 mb-2">Z-Score: <span className="font-semibold">{results.zScore.toFixed(2)}</span></div>
              {/* Odds calculation */}
              <div className="text-gray-900 mb-2">
                Odds: <span className="font-semibold">
                  1 in {(() => {
                    const p = normalCdf(results.zScore!);
                    if (p <= 0) return '∞';
                    return Math.round(1 / p).toLocaleString();
                  })()}
                </span>
              </div>
            </>
          )}
          {results.zScore !== undefined && (
            <div className="text-indigo-700 font-medium">
              {results.zScore < -4
                ? 'Extremely Unlikely (Almost Definitely Sandbagger)'
                : results.zScore < -3
                ? 'Very Unlikely (Probable Sandbagger)'
                : results.zScore < -2
                ? 'Very Unlikely (Possible Sandbagger)'
                : results.zScore < -1
                ? 'Unlikely (Suspicious)'
                : 'Within Normal Range'}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 