import React, { useRef, useState, useEffect, useLayoutEffect } from "react"
import gsap from "gsap"

const DEFAULT_HOVER_COLORS = ["#eab308", "#ef4444", "#3b82f6", "#06b6d4", "#8b5cf6"]

export const TextHoverEffect = ({
  text,
  duration,
  fontSize = 32, // Set smaller than 56
  colors = DEFAULT_HOVER_COLORS,
  strokeClassName = "stroke-neutral-200 dark:stroke-neutral-800",
  strokeWidth = 0.3,
}: {
  text: string
  duration?: number
  fontSize?: number
  /** Farben des Hover-Verlaufs (gleichmäßig verteilt) */
  colors?: string[]
  /** Tailwind-Klassen für die Grundkontur der Schrift */
  strokeClassName?: string
  strokeWidth?: number
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const maskGradientRef = useRef(null)
  const animatedTextRef = useRef(null)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)
  const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" })

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        animatedTextRef.current,
        { strokeDashoffset: 1000, strokeDasharray: 1000 },
        {
          strokeDashoffset: 0,
          strokeDasharray: 1000,
          duration: 4,
          ease: "power2.inOut",
        }
      )
    }, svgRef)

    return () => context.revert()
  }, [])

  const updateCursorPosition = (x: number, y: number) => {
    if (svgRef.current && x !== null && y !== null) {
      const svgRect = svgRef.current.getBoundingClientRect()
      const cxPercentage = ((x - svgRect.left) / svgRect.width) * 100
      const cyPercentage = ((y - svgRect.top) / svgRect.height) * 100

      const newPosition = {
        cx: `${cxPercentage}%`,
        cy: `${cyPercentage}%`,
      }

      setMaskPosition(newPosition)

      gsap.to(maskGradientRef.current, {
        attr: newPosition,
        duration: duration ?? 0,
        ease: "power2.out",
      })
    }
  }

  useEffect(() => {
    updateCursorPosition(cursor.x, cursor.y)
  }, [cursor, duration])

  const handleMouseEnter = () => setHovered(true)
  const handleMouseLeave = () => setHovered(false)
  const handleMouseMove = (e: React.MouseEvent) => {
    setCursor({ x: e.clientX, y: e.clientY })
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setHovered(true)
    if (e.touches.length > 0) {
      const touch = e.touches[0]
      setCursor({ x: touch.clientX, y: touch.clientY })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0]
      setCursor({ x: touch.clientX, y: touch.clientY })
    }
  }

  const handleTouchEnd = () => {
    setHovered(false)
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 300 100"
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="select-none"
    >
      <defs>
        <linearGradient
          id="textGradient"
          gradientUnits="userSpaceOnUse"
          cx="50%"
          cy="50%"
          r="20%"
        >
          {hovered &&
            colors.map((color, i) => (
              <stop
                key={`${color}-${i}`}
                offset={`${colors.length === 1 ? 0 : Math.round((i / (colors.length - 1)) * 100)}%`}
                stopColor={color}
              />
            ))}
        </linearGradient>
        <radialGradient
          id="revealMask"
          ref={maskGradientRef}
          gradientUnits="userSpaceOnUse"
          r="25%"
          cx={maskPosition.cx}
          cy={maskPosition.cy}
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </radialGradient>
        <mask id="textMask">
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#revealMask)"
          />
        </mask>
      </defs>

      {[0, 1, 2].map((_, idx) => (
        <text
          key={idx}
          ref={idx === 1 ? animatedTextRef : undefined}
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          strokeWidth={strokeWidth}
          className={`fill-transparent font-[helvetica] font-bold ${idx === 2 ? "" : strokeClassName}`}
          stroke={idx === 2 ? "url(#textGradient)" : undefined}
          mask={idx === 2 ? "url(#textMask)" : undefined}
          style={{
            fontSize,
            opacity: idx === 0 && !hovered ? 0 : idx === 0 ? 0.7 : 1,
          }}
        >
          {text}
        </text>
      ))}
    </svg>
  )
} 
