<script lang="ts">
  import tags from "$lib/tags.json";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { afterNavigate } from "$app/navigation";

  let { children } = $props();
  let expanded = $state(0);

  let isHomepage = $derived(false);
  let selectedTag = $derived("");

  afterNavigate(() => {
    isHomepage = page.url.pathname === "/";
    selectedTag =
      page.url.pathname === "/lists/"
        ? (page.url.searchParams.get("tag") ?? "all")
        : "";
  });

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
      <a href="/" class="home-link" class:active={isHomepage}>
        <p>🏠</p>
        <p>Home</p>
      </a>
      <div class="categories">
        <p class="section">Posts</p>
        <ul>
          {#each tags as tag}
            <li>
              <a
                href={`/lists?tag=${tag.tag}`}
                class:active={selectedTag.toLowerCase() ===
                  tag.tag.toLowerCase()}
              >
                {tag.tag.charAt(0).toUpperCase() + tag.tag.slice(1)}
                <span>{tag.count}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    </nav>
  </aside>

  <main>
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
    color: #323334;
    padding: 0.5rem 1rem;
    border-radius: 4px;
  }

  .sidebar nav .home-link:hover {
    background-color: #f1f1f2;
  }

  .sidebar nav .home-link.active {
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

  .sidebar nav .categories li a {
    display: flex;
    font-size: 0.8rem; /* 12.8px */
    font-weight: medium;
    justify-content: space-between;
    color: #323334;
    text-decoration: none;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-radius: 4px;
  }

  .sidebar nav .categories li a:hover {
    background-color: #f1f1f2;
  }

  .sidebar nav .categories li a.active {
    background-color: #f1f1f2;
  }

  main {
    position: relative;
    width: 100%;
    height: 100vh;
  }

  main .expand-toggle {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
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
    width: 100%;
    height: 100vh;
    overflow-y: auto;
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
