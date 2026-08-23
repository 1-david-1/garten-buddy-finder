import { useEffect, type RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export interface HeroAnimationRefs {
  section: RefObject<HTMLElement | null>;
  perspective: RefObject<HTMLDivElement | null>;
  phone: RefObject<HTMLDivElement | null>;
  sheen: RefObject<HTMLDivElement | null>;
  negotiationCard: RefObject<HTMLDivElement | null>;
  escrowCard: RefObject<HTMLDivElement | null>;
  floatingCards: RefObject<HTMLDivElement | null>[];
}

/**
 * Progressive-enhancement animation layer for the hero's iPhone mockup.
 *
 * Everything this hook touches (bezel, negotiation card, escrow card, floating
 * cards) is already fully visible via plain Tailwind in index.tsx. This hook
 * only ever *adds* motion on top of that static, legible baseline:
 * - gsap.set(...opacity:0) is the only thing that can hide content, and it
 *   only runs after we've confirmed GSAP initialized successfully.
 * - If anything throws during setup, we log and bail — the static hero stays
 *   100% usable either way.
 * - gsap.context(...).revert() on unmount kills every tween/ScrollTrigger this
 *   hook created, so navigating away (TanStack Router) never leaks listeners
 *   or leaves duplicate ScrollTriggers behind on remount.
 */
export function useHeroAnimation(refs: HeroAnimationRefs) {
  const { section, perspective, phone, sheen, negotiationCard, escrowCard, floatingCards } = refs;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!section.current || !phone.current || !perspective.current) return;

    let ctx: ReturnType<typeof gsap.context> | undefined;

    try {
      ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        // --- 1) Mouse-parallax tilt + dynamic light sheen (fine pointer only) ---
        mm.add("(hover: hover) and (pointer: fine)", () => {
          const wrapper = perspective.current;
          const card = phone.current;
          const sheenEl = sheen.current;
          if (!wrapper || !card) return;

          const onMove = (e: MouseEvent) => {
            const rect = wrapper.getBoundingClientRect();
            const relX = (e.clientX - rect.left) / rect.width;
            const relY = (e.clientY - rect.top) / rect.height;
            const xVal = relX * 2 - 1;
            const yVal = relY * 2 - 1;

            gsap.to(card, {
              rotationY: xVal * 12,
              rotationX: -yVal * 12,
              ease: "power3.out",
              duration: 1.2,
            });

            if (sheenEl) {
              sheenEl.style.setProperty("--mouse-x", `${relX * 100}%`);
              sheenEl.style.setProperty("--mouse-y", `${relY * 100}%`);
              gsap.to(sheenEl, { opacity: 1, duration: 0.3, overwrite: true });
            }
          };

          const onLeave = () => {
            gsap.to(card, { rotationY: 0, rotationX: 0, duration: 0.8, ease: "power3.out" });
            if (sheenEl) gsap.to(sheenEl, { opacity: 0, duration: 0.5, overwrite: true });
          };

          wrapper.addEventListener("mousemove", onMove);
          wrapper.addEventListener("mouseleave", onLeave);
          return () => {
            wrapper.removeEventListener("mousemove", onMove);
            wrapper.removeEventListener("mouseleave", onLeave);
          };
        });

        // --- 2) Scroll-driven stagger reveal, pinned on desktop only ---
        function setupScrollReveal({ pin, end }: { pin: boolean; end: string }) {
          const hiddenTargets = [
            negotiationCard.current,
            escrowCard.current,
            ...floatingCards.map((r) => r.current),
          ].filter((el): el is HTMLDivElement => Boolean(el));

          gsap.set(hiddenTargets, { opacity: 0, y: 24 });

          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: section.current,
              start: "top top",
              end,
              scrub: 1,
              pin,
              anticipatePin: 1,
            },
          });

          // Stage 2: phone scales/settles in
          tl.to(phone.current, { scale: 1.06, y: -10, duration: 1, ease: "power2.out" }, 0);
          // Stage 3: negotiation card, escrow card, floating cards reveal in sequence
          tl.to(
            hiddenTargets,
            { opacity: 1, y: 0, stagger: 0.15, duration: 0.6, ease: "power2.out" },
            0.15,
          );

          // Stage 4 (desktop only): phone pulls back into a small side-floating card
          if (pin) {
            tl.to(
              phone.current,
              { scale: 0.82, x: "30vw", y: "4vh", duration: 1, ease: "power2.inOut" },
              0.9,
            );
          }

          return () => {
            tl.scrollTrigger?.kill();
            tl.kill();
          };
        }

        mm.add("(min-width: 768px)", () => setupScrollReveal({ pin: true, end: "+=120%" }));
        mm.add("(max-width: 767px)", () => setupScrollReveal({ pin: false, end: "+=60%" }));
      }, section.current);
    } catch (err) {
      console.error("[hero-animation] GSAP init failed — static hero remains fully usable:", err);
    }

    return () => {
      ctx?.revert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
