<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Deep Rock Space Enterprises</title>
    
    <!-- Favicon -->
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico">
    <link rel="shortcut icon" href="/favicon.ico">
    
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #0a0a0a;
            color: #ffffff;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            position: relative;
            overflow: hidden;
        }

        /* Animated starfield background */
        .stars {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
        }

        .star {
            position: absolute;
            background: white;
            border-radius: 50%;
            animation: twinkle 3s infinite ease-in-out;
        }

        @keyframes twinkle {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
        }

        /* Company logo background - very subtle */
        .logo-background {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 60vw;
            height: 60vh;
            background-image: url('logo.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            opacity: 0.03;
            z-index: 2;
            filter: blur(1px);
        }

        /* Main content */
        .container {
            text-align: center;
            z-index: 10;
            padding: 2rem;
            position: relative;
        }

        .company-name {
            font-size: clamp(2.5rem, 8vw, 5rem);
            font-weight: 700;
            letter-spacing: 0.1em;
            margin-bottom: 1rem;
            background: linear-gradient(135deg, #f5f5f5, #d4d4d8, #a1a1aa, #71717a);
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 30px rgba(161, 161, 170, 0.4);
            animation: glow 2s ease-in-out infinite alternate;
        }

        @keyframes glow {
            from { filter: drop-shadow(0 0 20px rgba(161, 161, 170, 0.4)); }
            to { filter: drop-shadow(0 0 35px rgba(212, 212, 216, 0.6)); }
        }

        .coming-soon {
            font-size: clamp(1.2rem, 4vw, 2rem);
            font-weight: 300;
            letter-spacing: 0.2em;
            color: #a1a1aa;
            margin-bottom: 2rem;
            opacity: 0.9;
        }

        .subtitle {
            font-size: clamp(0.9rem, 2.5vw, 1.1rem);
            color: #71717a;
            max-width: 600px;
            margin: 0 auto 3rem;
            line-height: 1.6;
            opacity: 0.8;
        }

        /* Animated loading dots */
        .loading-dots {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            margin-top: 2rem;
        }

        .dot {
            width: 8px;
            height: 8px;
            background: #d97706;
            border-radius: 50%;
            animation: pulse 1.5s infinite ease-in-out;
        }

        .dot:nth-child(2) { animation-delay: 0.2s; }
        .dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes pulse {
            0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
            40% { transform: scale(1.2); opacity: 1; }
        }

        /* Floating particles */
        .particle {
            position: fixed;
            background: rgba(217, 119, 6, 0.7);
            border-radius: 50%;
            pointer-events: none;
            animation: float 6s infinite ease-in-out;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
        }

        /* Responsive design */
        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }
            
            .company-name {
                letter-spacing: 0.05em;
            }
            
            .coming-soon {
                letter-spacing: 0.1em;
            }
        }

        /* Subtle grid overlay */
        .grid-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(161, 161, 170, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(161, 161, 170, 0.03) 1px, transparent 1px);
            background-size: 50px 50px;
            pointer-events: none;
            z-index: 1;
        }
    </style>
</head>
<body>
    <!-- Animated starfield -->
    <div class="stars" id="starfield"></div>
    
    <!-- Grid overlay -->
    <div class="grid-overlay"></div>
    
    <!-- Company logo background -->
    <div class="logo-background"></div>
    
    <!-- Main content -->
    <div class="container">
        <h1 class="company-name">DEEP ROCK SPACE ENTERPRISES</h1>
        <h2 class="coming-soon">COMING SOON</h2>
        <p class="subtitle">
            Something extraordinary is on the horizon.
        </p>
        
        <div class="loading-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    </div>

    <script>
        // Generate random starfield
        function createStars() {
            const starfield = document.getElementById('starfield');
            const starCount = 150;
            
            for (let i = 0; i < starCount; i++) {
                const star = document.createElement('div');
                star.className = 'star';
                star.style.left = Math.random() * 100 + '%';
                star.style.top = Math.random() * 100 + '%';
                star.style.width = star.style.height = (Math.random() * 3 + 1) + 'px';
                star.style.animationDelay = Math.random() * 3 + 's';
                starfield.appendChild(star);
            }
        }

        // Create floating asteroids
        function createAsteroid() {
            const asteroid = document.createElement('div');
            asteroid.className = 'particle';
            
            // Random starting position at bottom
            asteroid.style.left = Math.random() * 100 + '%';
            asteroid.style.bottom = '-20px';
            
            // Random size between 3-8px for variety
            const size = Math.random() * 5 + 3;
            asteroid.style.width = asteroid.style.height = size + 'px';
            
            // Random horizontal drift
            const drift = (Math.random() - 0.5) * 200; // -100px to +100px drift
            asteroid.style.setProperty('--drift', drift + 'px');
            
            // Random animation duration
            asteroid.style.animationDuration = (Math.random() * 4 + 6) + 's';
            
            // Slight shape variation for more realistic asteroids
            const borderRadius = `${Math.random() * 30 + 20}% ${Math.random() * 30 + 50}% ${Math.random() * 30 + 50}% ${Math.random() * 30 + 20}%`;
            asteroid.style.borderRadius = borderRadius;
            
            document.body.appendChild(asteroid);

            // Remove asteroid after animation
            setTimeout(() => {
                if (asteroid.parentNode) {
                    asteroid.remove();
                }
            }, 12000);
        }

        // Initialize
        createStars();
        
        // Create asteroids periodically
        setInterval(createAsteroid, 1500);

        // Add smooth scroll behavior and prevent default scrolling
        document.addEventListener('wheel', function(e) {
            e.preventDefault();
        }, { passive: false });
    </script>
</body>
</html>