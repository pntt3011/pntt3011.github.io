<section class="post">
  <h1 class="title">Lorem ipsum dolor sit amet</h1>

  <div class="auxiliary">
    <p class="date">07/07/2025</p>
    <div class="tags">
      <span class="tag">Tag 1</span>
      <span class="tag">Tag 2</span>
    </div>
  </div>

  <div class="post-content">
    <h2>Here is the first header</h2>
    <p>
      Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a suscipit
      ipsum. Pellentesque dapibus ullamcorper dapibus. Nam eleifend egestas
      rutrum. Aliquam tempus aliquet ultricies. Morbi pulvinar vestibulum
      varius. Praesent at hendrerit nisi. Cras tincidunt lectus sed magna
      semper, vel porta nunc blandit. Ut accumsan fringilla libero non sagittis.
      Proin at pulvinar dolor, fermentum ultricies mi. Nunc eu pellentesque
      nibh. Suspendisse ut vestibulum quam, et vehicula neque. Duis aliquam
      fringilla tortor quis lacinia.
    </p>

    <p>Here is an unordered list:</p>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </ul>

    <p>Here is an ordered list:</p>
    <ol>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </ol>

    <h2>Here is the second header</h2>
    <div class="image-box"></div>
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

  .post-content {
    display: flex;
    flex-direction: column;
  }

  .post-content h2 {
    color: #000;
    font-weight: bold;
    font-size: 1.25rem;
    line-height: 2rem;
  }

  .post-content p {
    padding-left: 2rem;
  }

  .post-content ul,
  .post-content ol {
    padding-left: 3rem;
    margin-block-start: 0;
    margin-block-end: 0;
  }

  .post-content p,
  .post-content ul,
  .post-content ol {
    color: #323334;
    text-align: justify;
    font-size: 1rem;
    line-height: 2rem;
  }

  .post-content h2,
  .post-content p,
  .post-content .image-box {
    margin-block-start: 1.5rem;
    margin-block-end: 0;
  }

  .post-content .image-box {
    width: 80%;
    aspect-ratio: 1 / 1;
    background: #ededed;
    margin-left: auto;
    margin-right: auto;
  }
</style>
