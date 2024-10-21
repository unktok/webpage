document.addEventListener('DOMContentLoaded', function() {
    const aboutLink = document.getElementById('about-link');
    const contactLink = document.getElementById('contact-link');
    const aboutPopup = document.getElementById('about-popup');
    const contactPopup = document.getElementById('contact-popup');
    const closeBtns = document.getElementsByClassName('close');
    const header = document.querySelector('header');

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Header background change on scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // Popup functionality
    function openPopup(popup) {
        popup.style.display = "block";
        setTimeout(() => {
            popup.classList.add('show');
        }, 10);
    }

    function closePopup(popup) {
        popup.classList.remove('show');
        setTimeout(() => {
            popup.style.display = "none";
        }, 300);
    }

    aboutLink.onclick = function(e) {
        e.preventDefault();
        openPopup(aboutPopup);
    }

    contactLink.onclick = function(e) {
        e.preventDefault();
        openPopup(contactPopup);
    }

    Array.from(closeBtns).forEach(btn => {
        btn.onclick = function() {
            closePopup(this.closest('.popup'));
        }
    });

    window.onclick = function(event) {
        if (event.target.classList.contains('popup')) {
            closePopup(event.target);
        }
    }

    // Typing effect for the main heading
    const heading = document.querySelector('main h1');
    const text = heading.textContent;
    heading.textContent = '';
    let i = 0;

    function typeWriter() {
        if (i < text.length) {
            heading.textContent += text.charAt(i);
            i++;
            setTimeout(typeWriter, 100);
        }
    }

    typeWriter();

    // Intersection Observer for fade-in effect
    const faders = document.querySelectorAll('.fade-in');
    const appearOptions = {
        threshold: 0.5,
        rootMargin: "0px 0px -100px 0px"
    };

    const appearOnScroll = new IntersectionObserver(function(entries, appearOnScroll) {
        entries.forEach(entry => {
            if (!entry.isIntersecting) {
                return;
            } else {
                entry.target.classList.add('appear');
                appearOnScroll.unobserve(entry.target);
            }
        });
    }, appearOptions);

    faders.forEach(fader => {
        appearOnScroll.observe(fader);
    });
});