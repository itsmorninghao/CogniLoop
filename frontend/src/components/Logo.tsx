/**
 * CogniLoop logo — "C" monogram with neural loop accent.
 * Uses currentColor to follow light/dark theme automatically.
 */

export default function Logo({ size = 24, className = '' }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {/* Background circle — uses theme-aware muted color */}
            <rect width="32" height="32" rx="8" className="fill-foreground/10" />
            {/* C letterform */}
            <path
                d="M19.5 10C18.4 9.2 17 8.7 15.5 8.7C11.9 8.7 9 11.6 9 15.2V16.8C9 20.4 11.9 23.3 15.5 23.3C17 23.3 18.4 22.8 19.5 22"
                className="stroke-foreground"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
            {/* Neural accent dot */}
            <circle cx="21.5" cy="11" r="2" className="fill-foreground" opacity="0.8" />
            <circle cx="21.5" cy="21" r="1.2" className="fill-foreground" opacity="0.4" />
            {/* Loop arc */}
            <path
                d="M21.5 11C23.5 13 24.5 14.8 24.5 16.5C24.5 18.2 23.5 20 21.5 21"
                className="stroke-foreground"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeDasharray="2 2.5"
                opacity="0.5"
            />
        </svg>
    )
}
