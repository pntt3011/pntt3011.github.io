<script lang="ts">
  import { onMount } from "svelte";
  let { children } = $props();
  let expanded = $state(0);

  function updateExpandedState(mq: MediaQueryListEvent | MediaQueryList) {
    expanded = mq.matches ? -1 : 1;
  }

  // Initialize the expanded state based on the current viewport width
  onMount(() => {
    const mediaQuery = window.matchMedia("(max-width: 520px)");
    updateExpandedState(mediaQuery);
    mediaQuery.addEventListener("change", updateExpandedState);

    return () => {
      mediaQuery.removeEventListener("change", updateExpandedState);
    };
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Roboto:wght@400;500;700"
    rel="stylesheet"
  />
</svelte:head>

<div class="app">
  <aside
    class="sidebar"
    class:expanded={expanded > 0}
    class:collapsed={expanded < 0}
  >
    <nav>
      <p class="blog-name">Tung Phan</p>
      <a href="/" class="home-link">
        <p>🏠</p>
        <p>Home</p>
      </a>
      <div class="categories">
        <p class="section">Posts</p>
        <ul>
          <li><a href="/lists?tag=all">All <span>10</span></a></li>
          <li><a href="/lists?tag=tag1">Tag 1 <span>9</span></a></li>
          <li><a href="/lists?tag=tag2">Tag 2 <span>3</span></a></li>
        </ul>
      </div>
    </nav>
  </aside>

  <main>
    <div>
      <button
        onclick={() => (expanded = -expanded)}
        class="expand-toggle"
        aria-label="Toggle sidebar"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          transform="rotate(-90 0 0)"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="9" y="9" width="14" height="14" rx="3" stroke="#222222" />
          <path d="M23 14L9 14" stroke="#222222" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="content-scroll">
      <div style="padding-top:5rem;padding-bottom:5rem;flex:1;">
        <div class="content">
          {@render children()}
        </div>
      </div>
    </div>
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: row;
    min-height: 100vh;
    font-family: "Roboto", sans-serif;
  }

  .sidebar {
    width: 200px;
    background-color: #fcfcfc;
    color: #323334;
    padding: 1rem;
    border-right: 1px solid #ededed;
    font-family: "Inter", sans-serif;
    display: flex;
    flex-direction: column;
    white-space: nowrap;
    overflow: hidden;
    transition:
      width 0.3s ease,
      padding 0.3s ease;
  }

  @media (max-width: 520px) {
    .sidebar {
      width: 0;
      padding: 1rem 0;
      border: none;
    }
  }

  .sidebar.expanded {
    width: 200px;
    padding: 1rem;
    border-right: 1px solid #ededed;
  }

  .sidebar.collapsed {
    width: 0;
    padding: 1rem 0;
    border: none;
  }

  .sidebar nav {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .sidebar nav p {
    margin-block-start: 0;
    margin-block-end: 0;
  }

  .sidebar nav .blog-name {
    font-size: 0.875rem; /* 14px */
    font-weight: bold;
  }

  .sidebar nav .home-link {
    display: flex;
    align-items: center;
    flex-direction: row;
    gap: 0.5rem;
    font-size: 0.8rem; /* 12.8px */
    text-decoration: none; /* Remove underline */
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  .sidebar nav .home-link:hover {
    background-color: #f1f1f2;
  }

  .sidebar nav .categories {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .sidebar nav .categories .section {
    font-size: 0.7rem;
    font-weight: bold;
    color: #6e7477;
  }

  .sidebar nav .categories ul {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    list-style: none;
    margin-block-start: 0;
    margin-block-end: 0;
    padding: 0;
  }

  .sidebar nav .categories li {
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-radius: 4px;
  }

  .sidebar nav .categories li:hover {
    background-color: #f1f1f2;
  }

  .sidebar nav .categories li a {
    display: flex;
    font-size: 0.8rem; /* 12.8px */
    font-weight: medium;
    justify-content: space-between;
    color: #323334;
    text-decoration: none;
  }

  main {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  main .expand-toggle {
    margin: 0.5rem;
    border-radius: 4px;
    padding: 0;
    border: none;
    background: none;
  }

  main .expand-toggle:hover {
    background-color: #f1f1f2;
    cursor: pointer;
  }

  main .content-scroll {
    overflow-y: auto;
    flex: 1;
  }

  main .content {
    flex: 1;
    padding: 0rem 1rem;
    max-width: 640px;
    min-width: 320px;
    margin-left: auto;
    margin-right: auto;
  }
</style>
