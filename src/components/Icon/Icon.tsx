import type { ComponentType, SVGProps } from 'react'

export type SvgComponent = ComponentType<SVGProps<SVGSVGElement>>

type IconProps = {
  svg: SvgComponent
  size?: number
  className?: string
  /** Omit for decorative icons so screen readers skip them. */
  label?: string
}

export function Icon({ svg: Svg, size = 20, className, label }: IconProps) {
  return (
    <Svg
      className={className}
      width={size}
      height={size}
      focusable="false"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
