<script lang="ts">
  let { children } = $props();
</script>

<svelte:head>
  <title>Post Layout</title>
</svelte:head>

<section class="post">
  <h1 class="title">Lorem ipsum dolor sit amet</h1>

  <div class="auxiliary">
    <p class="date">07/07/2025</p>
    <div class="tags">
      <span class="tag">Tag 1</span>
      <span class="tag">Tag 2</span>
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
