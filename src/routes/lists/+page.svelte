<script lang="ts">
  import posts from "$lib/posts.json";
  import { page } from "$app/state";
  import { type ClientPost, type Post, converToClientPost } from "$lib/types";

  const client_posts: ClientPost[] = posts.map((post: Post) => converToClientPost(post));

  const tag = $derived(page.url.searchParams.get("tag"));
  const filtered_posts = $derived(getFiltedPost(tag));

  function getFiltedPost(tag: string | null): ClientPost[] {
    return client_posts.filter(
      (post) => !tag || tag == "all" || post.tags?.includes(tag),
    );
  }
</script>

<section>
  <h1>{tag.charAt(0).toUpperCase() + tag.slice(1)} blogs</h1>
  <div class="post-list">
    {#each filtered_posts as post}
      <a class="post-preview" href="/posts/{post.id}">
        <h3>{post.title}</h3>
        <p class="date">{post.creation_time}</p>
        <p>{post.preview}</p>
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
    text-align: justify;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: #323334;
  }
</style>
