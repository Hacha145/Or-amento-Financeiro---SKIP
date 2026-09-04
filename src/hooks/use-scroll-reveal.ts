import { useEffect, useRef } from 'react'

/**
 * Scroll reveal hook that mimics the MASTER.md GSAP ScrollTrigger specification:
 * - Trigger: scroll into view (start: 'top 90%')
 * - Duration: 350ms
 * - Small y offset: 12px fade + slide
 * - toggleActions: 'play none none reverse' (reveals on entry, reverses when scrolled back above)
 * - Honors prefers-reduced-motion: renders immediately if reduced motion is requested
 * - Works natively without extra external packages
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // If reduced motion is preferred, ensure visible immediately and exit
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      el.classList.remove('reveal-init')
      el.classList.add('reveal-visible')
      return
    }

    el.classList.add('reveal-init')

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-visible')
          } else {
            // Check if element is below viewport (so it can re-reveal on scroll down)
            const rect = entry.boundingClientRect
            if (rect.top > window.innerHeight * 0.9) {
              entry.target.classList.remove('reveal-visible')
            }
          }
        })
      },
      {
        rootMargin: '0px 0px -10% 0px',
        threshold: 0.1,
      },
    )

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [])

  return ref
}
