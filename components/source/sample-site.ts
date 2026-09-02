import type { SourceSite } from "@/lib/domain";

export const SAMPLE_SOURCE_SITE: SourceSite = {
  html: `<header class="site-header">
  <h1>Acme Studio</h1>
  <nav aria-label="Main navigation">
    <a href="#services">Services</a>
    <a href="#about">About</a>
    <a href="#contact">Contact</a>
  </nav>
</header>
<main>
  <section class="hero">
    <h2>Websites that work for your business</h2>
    <p>We build simple websites for growing teams.</p>
    <a class="button" href="#contact">Get started</a>
  </section>
  <section id="services" class="services">
    <h2>Our services</h2>
    <article><h3>Design</h3><p>Clear layouts for your customers.</p></article>
    <article><h3>Development</h3><p>Reliable sites built for the web.</p></article>
    <article><h3>Support</h3><p>Practical help after launch.</p></article>
  </section>
</main>
<footer id="contact">Contact hello@acme.test</footer>`,
  css: `body {
  margin: 0;
  font-family: Arial, sans-serif;
  color: #222;
}

.site-header {
  padding: 20px;
  background: #eeeeee;
  text-align: center;
}

nav a {
  margin: 0 8px;
  color: #2457a7;
}

.hero {
  padding: 70px 20px;
  text-align: center;
  background: #dbeafe;
}

.button {
  display: inline-block;
  margin-top: 12px;
  padding: 10px 16px;
  background: #2457a7;
  color: white;
}

.services {
  padding: 40px 20px;
}

.services article {
  display: inline-block;
  width: 30%;
  vertical-align: top;
}

footer {
  padding: 24px;
  background: #eeeeee;
  text-align: center;
}`,
};
