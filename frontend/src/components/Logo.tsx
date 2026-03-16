/**
 * CogniLoop logo — brain + infinity loop icon.
 * Transparent background, indigo brand color.
 */
import logoUrl from '@/assets/cogniloop_logo.png'

export default function Logo({ size = 24, className = '' }: { size?: number; className?: string }) {
    return (
        <img
            src={logoUrl}
            alt="CogniLoop"
            width={size}
            height={size}
            style={{ width: size, height: size, objectFit: 'contain' }}
            className={className}
        />
    )
}
