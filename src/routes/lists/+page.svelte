<script lang="ts">
  interface Post {
    title: string;
    date: string;
    excerpt: string;
  }

  let posts: Post[] = Array.from({ length: 6 }, (_, i) => ({
    title: "Lorem ipsum dolor sit amet",
    date: "07/07/2025",
    excerpt:
      "Vivamus at quam a tortor imperdiet ullamcorper ac sed urna. In venenatis pharetra nibh vel egestas...",
  }));
</script>

<section>
  <h1>All blogs</h1>
  <div class="post-list">
    {#each posts as post}
      <a class="post-preview" href="/posts">
        <h3>{post.title}</h3>
        <p class="date">{post.date}</p>
        <p>{post.excerpt}</p>
      </a>
    {/each}
  </div>
</section>

<style>
  p,
  h1,
  h3 {
    margin-block-start: 0;
    margin-block-end: 0;
  }

  h1 {
    font-size: 2rem;
    font-weight: bold;
    line-height: 2rem;
    padding: 0.5rem 0;
    margin-bottom: 1rem;
  }

  .post-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .post-list .post-preview {
    display: flex;
    flex-direction: column;
    padding: 0.5rem;
    border-radius: 4px;
    text-decoration: none;
    color: inherit;
  }

  .post-list .post-preview:hover {
    background-color: #f1f1f2;
    cursor: pointer;
  }

  .post-preview h3 {
    font-size: 1.25rem;
    font-weight: bold;
    line-height: 2rem;
  }

  .post-preview .date {
    font-size: 0.625rem;
    line-height: 2rem;
    color: #6e7477;
  }

  .post-preview p {
    font-size: 0.875rem;
    line-height: 1.125rem;
    color: #323334;
  }
</style>
