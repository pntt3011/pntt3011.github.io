<script lang="ts">
  import posts from "$lib/posts.json";
  import { page } from "$app/state";
  import { type ClientPost, type Post, converToClientPost } from "$lib/types";

  let { children } = $props();
  const post: Post | null = posts.find(
    (p: Post) => p.id === page.url.pathname.split("/").pop(),
  );
  const client_posts: ClientPost | null = post
    ? converToClientPost(post)
    : null;
</script>

<svelte:head>
  <title>{post?.title}</title>
</svelte:head>

<section class="post">
  <h1 class="title">{post?.title}</h1>

  <div class="auxiliary">
    <p class="date">{post?.creation_time}</p>
    <div class="tags">
      {#each post?.tags ?? [] as tag}
        <span class="tag">{tag}</span>
      {/each}
    </div>
  </div>

  <div>
    {@render children()}
  </div>
</section>

<style>
  .post {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .title {
    font-size: 2rem;
    font-weight: bold;
    line-height: 2rem;
    margin-block-start: 0;
    margin-block-end: 0;
  }

  .auxiliary {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .auxiliary .date {
    color: #6e7477;
    font-size: 0.75rem;
    padding: 0 0.25rem;
    margin-block-start: 0;
    margin-block-end: 0;
  }

  .auxiliary .tags {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
  }

  .auxiliary .tags .tag {
    background-color: #f1f1f2;
    color: #323334;
    font-size: 0.75rem;
    line-height: 1.25rem;
    padding: 0 0.75rem;
    border-radius: 16px;
  }
</style>
