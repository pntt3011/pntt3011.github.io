
		<section class="post-content" style="display: flex; flex-direction: column;">
		<p>202507081434<br />
Tags: [[diy]] [[tech]]</p>
<h1>Personal Blog ver 1.0</h1>
<h2>Prerequisite</h2>
<ul>
<li>Essential knowledge of programming (such as data type, control statement, etc)</li>
<li>Basic experiences with terminal, IDE, ChatGPT, webpage inspection, Github.</li>
</ul>
<h2>Motivation</h2>
<p>I think this topic will make a good &quot;setting out&quot; post. I update the content and work on the initial version simultaneously to keep it realistic.</p>
<p>How do I decide the core features? What will the UI/UX look like? Which framework should I use? These thought processes are presented in a clear and coherent way. When readers, including my future self, want to create their own blog, they can take this as a reference.</p>
<p>If not, documentation is always important too (unless you're too lazy, like me). Writing documents helps us comprehend our works much more deeper. I've lost count of how many times I've asked myself &quot;why did I create this thing? What does this even mean to me?&quot;. That is going to change, starting now.</p>
<h2>Objectives</h2>
<p>First and foremost, I must define the objectives of my blog. This helps prevent me from working on appealing but fleeting ideas I come up with while looking for inspiration. I can identify these objectives by asking a few simple questions:</p>
<ul>
<li>What <strong>kind of topics</strong> is the blog about?
<ul>
<li><strong>Various topics, whatever I feel like learning about (1).</strong>
<ul>
<li>I enjoy learning new things. By rigorously explaining a topic, I can understand it more clearly. This also benefits others who learn through my posts.</li>
</ul>
</li>
</ul>
</li>
<li>What <strong>type of contents</strong> does the blog have?
<ul>
<li><strong>Text-intensive (2)</strong> (like Substack and Medium), not media-intensive (like Instagram and Youtube).
<ul>
<li>I prefer writing over editing photos and videos. But I am also a fan of visual learning so some images are expected.</li>
</ul>
</li>
</ul>
</li>
<li>Which <strong>audience</strong> am I targeting?
<ul>
<li><strong>Anyone (3)</strong>.
<ul>
<li>I'll try to explain things as simply as possible. Using analogies is a form of interconnected thinking and helps improve problem-solving skills.</li>
<li>However, while writing a guide about building a website, I shouldn't go into how a computer works, right? They're connected in some ways, but that would be too far off track. Whenever I feel that explaining something would derail the main topic, I’ll briefly describe the main idea or note it as a prerequisite.</li>
</ul>
</li>
</ul>
</li>
</ul>
<p>These objectives give me a rough image of the blog. Now, let's make it more explicit by adding core features and user interfaces. Defining the core features first will make it easier to justify a user interface.</p>
<h2>Core features</h2>
<p>I recall all kinds of blogs I've come across and decide which features to include in my own blog. A feature is selected if one of the following conditions is met:</p>
<ul>
<li><strong>Align with one or more objectives</strong>, since working on nonessential features can take significantly more time to implement. Sometimes, an assumption must be made to connect a feature to an objective. I’ll revisit this point when the time comes.</li>
<li>Must-have for <strong>(user experience) UX purposes</strong>. UX is like breathing, not mentioned everywhere, but always needed. These features are usually common across all apps, and over time, they become unwritten rules that everyone follows.</li>
<li>When a decision must be made but none of the options are clearly better than the others, I’ll choose based on <strong>personal preference</strong>.</li>
</ul>
<p>Here is the exhaustive list I came up with:</p>
<ol>
<li>A homepage with basic information (obj 1, 2, 3)
<ul>
<li>The objectives are explained here.</li>
</ul>
</li>
<li>A list of posts, sorted by time, on a separate page from the homepage (obj 1, UX)
<ul>
<li>Clicking on an item opens the corresponding post.</li>
<li>Does every item have a thumbnail? -&gt; No. I don't like spending time choosing one for each post.</li>
<li>Should I sort items lexicographically or in different order instead? -&gt; No. Assume users want to read latest posts.</li>
<li>Can readers navigate back? -&gt; Yes.</li>
</ul>
</li>
<li>Readers can navigate back to homepage from any post (UX)
<ul>
<li>Can readers navigate to the post list too? -&gt; Yes</li>
</ul>
</li>
<li>Readers can navigate back to the post list from any post (UX)</li>
<li>Each post has multiple sections, each section is led by a header (obj 2, UX)
<ul>
<li>All text is justified.</li>
<li>Can a section have subsections or sub-subsections? -&gt; No, a flatten structure provides more clarity (UX)</li>
<li>Can a section have numbered or bulleted list -&gt; Yes (UX)</li>
<li>Does this mean no photo or video? -&gt; Photos are optional, videos and other media types are excluded.</li>
<li>Can a section be collapsed for more compact content? -&gt; No need.</li>
</ul>
</li>
<li>Posts can contain photos (obj 2)
<ul>
<li>Photos are always center-aligned.</li>
<li>Will I add captions to photos? -&gt; No. The leading paragraph should give the context instead.</li>
</ul>
</li>
<li>Each post must have at least 1 tag/category (obj 1)
<ul>
<li>Tags are shown at the beginning of the post.</li>
<li>Inspired by <a href="https://sketchplanations.com/categories">sketchplanation</a>, since I'm going to write about various topics. Tags helps readers more easily find content that interests them.</li>
<li>-&gt; Need to display lists by tags (UX).
<ul>
<li>Adding a filter on the list page (fea 2) is a good option, but it requires two steps to access content by topic. Can we do better?</li>
<li>-&gt; Show top common tags in the same level as the post list page (fea 2). If I can't find an appropriate UI for this, I may skip this option.</li>
</ul>
</li>
</ul>
</li>
<li>(Optional) Show top common tags (sorted by number of appearance) alongside the post list page (fea 2) (UX)
<ul>
<li>Clicking a tag opens a page showing only relevant posts.</li>
<li>This also means readers can navigate to a tag page from any post (UX).</li>
</ul>
</li>
<li>Readers cannot comment (self preferences)
<ul>
<li>This could be a great feature for sharing and learning. Readers can discuss the topic more easily. I could also benefit from their input to improve my knowledge.</li>
<li>However, due to the implementation cost, I plan to add it later, once I have more posts and more people are aware of this blog.</li>
</ul>
</li>
</ol>
<h2>Sketching the User Interface (UI)</h2>
<p>As a non-designer, this is the most painful part. I can tell whether a UI feels right or no, but building one from scratch is a different story. Where should I place the home button? Should the post list be vertical or in a grid? What color should the background be? I think starting with an existing template and adjusting it to fit my needs is a good approach.</p>
<p>Now, I’m facing the second most painful part: <strong>where to get that template</strong>. Most blogs I read contain more information than I need for my use case. And when I imagine removing all the irrelevant elements, the remaining layout often feels awkward. I've tried searching for minimalist UIs, but many still give me an uneasy feeling. For example, the homepage banner often stretches across the entire page width, which is unnecessarily large for what I want.</p>
<p>Let's ask ChatGPT to generate one. The design is clean and simple, yet I'm still unsatisfied. Sometimes I cannot describe my feeling well, and this time is no exception. I want to look through a few more blogs. This step is mostly based on personal tastes, so it may take a while.</p>
<p>After some time, I find that the page <a href="https://garry.net/">garry.net</a> appealed to me. The difference lies in its vertical navigation instead of a horizontal one. I realize that this layout is also used in the Steam Store, which may explain my preference.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250709154252.png" alt="" width="507" height="569" style="max-width: 71%; height: auto; margin-left: auto; margin-right: auto;"/>
<p>Now, I have enough material to start sketching the website. My favorite tool is <a href="https://www.tldraw.com/">tldraw</a> because of its handwritten style and infinite canvas. I can draw anything I want, anywhere. To avoid missing any UI element, I'll go through each feature and sketch either its visual component or the interaction between components. With so few features, I can cramp all of them into one place. If that's not possible, I have to split them based on their functions.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250709164518.png" alt="" width="798" height="590" style="max-width: 80%; height: auto; margin-left: auto; margin-right: auto;"/>
<p>You can see two red areas and some green boxes in the draft above. These problems were overlooked previously and only discovered while drawing the UI. This is inevitable and expected to happen more often in complex applications. One of the issues is the scrolling behavior whenever a post is too long, let's call it feature 10: Readers can scroll vertically if the post content is longer than the screen height.</p>
<p>As for the rest (text rule and green boxes), I call this business logic. To put it simply:</p>
<ul>
<li><strong>UI logic</strong>: how and where an element is displayed (color, position, shape, etc).</li>
<li><strong>Business logic</strong>: when (interaction) and what an element displays (content), along with invisible logic (i.e. download)<br />
Why don't we separate visible and invisible logic? Why are the interactions and contents grouped with hidden logic? Let's find the answers in the next section.</li>
</ul>
<h2>Business logic</h2>
<p>Let's use feature 8) as an example. Is that always &quot;#tag1&quot; like in the sketch?<br />
The answer is NO. That text could be &quot;#engineer&quot;, &quot;#toy&quot; or even &quot;#idk&quot;. Multiple tags can also appear here, depending on the tags assigned to my posts. This is a dynamic element, where its appearance changes according to some internal values (or semantic states, whatever you want to call it).</p>
<p>Why did I say &quot;according to some internal values&quot;? Isn't appearance change enough?<br />
Imagine clicking on &quot;#tag1&quot;, it triggers a zoom-in and zoom-out animation instead. In this case, the &quot;internal value&quot; of the tag stays the same, but its appearance changes. That makes it UI logic, because it's about &quot;how&quot; an element is displayed.</p>
<p>Thus, <strong>business logic is always tied to changes in some &quot;internal values&quot;</strong> . This definition also applies to interactions and invisible logic. When you download a file (the UI doesn't show anything), the &quot;internal value&quot; changes from &quot;no file&quot; to &quot;file available&quot;. When you click an area, its state changes from &quot;default&quot; to &quot;clicked&quot;.</p>
<p>Here's a tip to decide whether an element involves UI or business logic.<br />
Ask yourself &quot;If the relevant value changes to something random, do the core features still work as expected?&quot;. If no, then it involves business logic. If yes, it's likely pure UI logic.</p>
<p>Most business logic is associated with UI logic. Business logic determines the internal value, while UI logic controls how that element is visually displayed. For example, the decision to show a post's creation date is business logic, but decision to display it in DD/MM/YYYY or MM/DD/YYYY format is UI logic.</p>
<p>Let's go through all features once more time, along with the sketched UI, to determine which ones involve business logic. I'll also note the associated internal values and how they are connected to the UI.</p>
<ol>
<li>Homepage.
<ul>
<li>The text area on the right is tied to <strong>the content I want to display</strong>.</li>
<li>The <strong>Home label</strong> must be highlighted while others remain default, to inform that the homepage is currently active.</li>
<li>The rest, such as my name or the background, is purely UI logic. These elements are expected to stay the same. Though even if they don't, no catastrophic effect will occur.</li>
</ul>
</li>
<li>List of posts
<ul>
<li>The text area shows the <strong>list of posts</strong>, along with each post’s <strong>title, creation date, and preview text</strong>. This list changes whenever I add or update a post. (I don’t plan to delete any)</li>
<li>The <strong>click area</strong> of a <strong>post</strong> must cover the title, creation date and preview text.</li>
<li>The <strong>list of posts</strong> must be vertically scrollable, controlled by <strong>the scroll position on the vertical axis</strong>.</li>
<li>The <strong>All label</strong> must be highlighted while others remain default, to indicate that the post list is currently active.</li>
</ul>
</li>
<li>Navigate back to homepage from any post.
<ul>
<li>This means that the post and homepage share an internal value. Let's call this <strong>an endpoint</strong>. It switches between &quot;homepage&quot; and &quot;posts&quot; whenever users click a navigation item.</li>
<li>Based on 1 and 2, I can deduce that the <strong>endpoint</strong> determines both <strong>the content displayed and the highlighted labe</strong>l.</li>
</ul>
</li>
<li>Navigate back to the post list from any post
<ul>
<li>Same as 3.</li>
</ul>
</li>
<li>All posts can have headers, sections and lists.
<ul>
<li>Each <strong>post</strong> has a distinct <strong>endpoint</strong>, which determines its <strong>content</strong>. The <strong>content</strong> is composed of <strong>headers, sections, and lists</strong>. All of them can change when the post is updated.</li>
</ul>
</li>
<li>Posts can contain photos.
<ul>
<li>Things get interesting here. What represents a photo? In theory, a photo is a composition of many pixels, each with a brightness value. Thus, I need to store the position and brightness value for every pixel to display a photo.</li>
<li>Fortunately, modern render frameworks can handle this for me. I only need to provide a <strong>photo URL</strong> at the correct position in the <strong>post content</strong>. A wrong URL may result in an irrelevant or broken image.</li>
</ul>
</li>
<li>All posts must have tags.
<ul>
<li><strong>Tags</strong> obviously attach to the business logic of a <strong>post</strong>. Their values can affect how we categorize the posts significantly.</li>
</ul>
</li>
<li>List of posts by tags.
<ul>
<li>Same as 2, the <strong>list of posts with their title, creation date, preview text and vertical position</strong> involves business logic. These posts must contain the selected tag, meaning this list is a subset from the list in feature 2.</li>
<li>The <strong>corresponding tag label</strong> must be highlighted to indicate the active filter.</li>
<li>From 3, I also conclude that a <strong>tag</strong> is also a valid <strong>endpoint</strong> value.</li>
</ul>
</li>
<li>Readers cannot comment (self preferences)
<ul>
<li>Nothing to do here.</li>
</ul>
</li>
<li>Readers can scroll vertically if the post content is longer than the screen height
<ul>
<li>Same as 2 or 8, the <strong>vertical scroll position</strong> is part of the business logic.</li>
</ul>
</li>
</ol>
<p>I think I should add a photo beside some features for better visualization, maybe next time. I notice some overlapping internal values among these features. Let's summarize them first:</p>
<ul>
<li>Labels' highlighted state and areas.</li>
<li>The page's endpoint</li>
<li>The page's content</li>
<li>The list of posts</li>
<li>The click area of each post in list post</li>
<li>The post's title, creation date, preview text, tags and content</li>
<li>The arrangment of headers, sections, lists, photos within a content</li>
<li>Vertical scroll position of the tag list and page content</li>
</ul>
<p>There are also some relationships between these values. Some can only be updated by me, whereas others can be updated by readers. Let's move onto the next section, <strong>Data diagram</strong>, where I'll cover this in more detail.</p>
<h2>Data diagram</h2>
<p>Data diagram illustrates the relationships between the internal values (or data for short) and who (or which actor) has the privillege to update each one. There are 3 <strong>types of relationship</strong>:</p>
<ul>
<li>1 - 1: e.g. one endpoint is associated with one content.</li>
<li>1 - n: e.g. one post contains many sections.</li>
<li>n - n: e.g. one post contains many tags, and one tag can appear in many posts</li>
</ul>
<p>Here is the data diagram of my blog (credit to <a href="https://www.tldraw.com/">tldraw</a>, again)</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250714090725.png" alt="" width="1024" height="482" style="max-width: 80%; height: auto; margin-left: auto; margin-right: auto;"/>
<p>Why do I need this diagram?<br />
The relationships demonstrate the contraints among the data, which creates data consistency. Without this diagram, I may forget all post tags must be displayed on the sidebar or the post list may not show all available posts.</p>
<p>Now that I’ve finished all the planning, let’s proceed to implement each part.</p>
<h2>Drawing the detailed UI</h2>
<p>Let's stick with the most popular tool <a href="https://www.figma.com/">Figma</a> . Don't ask me about other tools, I don't know how to compare them. As long as it gets the job done, I'm good.</p>
<p>Before using any AI tool, I need to have some basic knowledge to evaluate the output and adjust it if needed. I've heard that responsive UI is a key concern when designing interfaces, so I should watch some tutorials on this topic first.</p>
<p>What is responsive UI? Why does it matter? You may ask.<br />
A website is essentially a rectangle with content inside (I don’t think there are any round or star-shaped websites). And like all rectangles, it has two dimensions: width and height. These values vary across devices. For example, a mobile phone, a table and a desktop all have different screen ratios, not to mention the variations between brands.<br />
<strong>A responsive UI is one that behaves as expected across all kinds of screen sizes</strong> Of course, these are reasonable limits, a screen can't be too big or too small.</p>
<p>After watching some videos, I come across another keyword: <strong>Auto layout</strong>. This refer to grouping elements in a particular order, like vertically or horizontally, and defining the constraints between them (minimum size, maximum size, spacing, etc). This grouping creates a new container, which can then be used in other groups. Consequently, these elements automatically stretch or shrink when the screen resizes.</p>
<p>How do I know which elements to group?<br />
I also run into this question myself while designing a UI in Figma. From my experience:</p>
<ul>
<li>If elements are laid out horizontally or vertically next to each other, they should be in the same group.</li>
<li>If an element is centered within an area, it should also be placed inside a group.</li>
</ul>
<p>Which font family, font size and color should I choose?<br />
I use <strong>Roboto</strong> font for the content area, while the rest is in <strong>Inter</strong>. I find that Inter characaters are wider, making it more suitable for labels. Meanwhile, Roboto is narrower and denser, making it easier for users to read longer blocks of text. These two fonts are used on <a href="https://garry.net/">garry.net</a> so I only compare between them. For the color palette, I take inspiration from <a href="https://garry.net/">garry.net</a>, <a href="https://chatgpt.com/">ChatGPT</a>, and <a href="https://www.tldraw.com/">tldraw</a>, then select what looks best in terms of contrast.</p>
<p>What maximum and minimum sizes should I choose?<br />
A responsive UI is typically expected to work across screen widths ranging from <strong>320px to 1920px</strong> (according to <a href="https://uxpickle.com/what-is-the-smallest-screen-size-you-should-design-for/">this link</a>). So 320px should be a reasonable minimum value.<br />
But 1920px is too wide for comfort reading. I think a text line should contain around 10 words to make scanning easier. Depending on the font size and font family I am using, a maximum content width of 640px should be efficient.<br />
<strong>Remember to set all text blocks to fill width</strong> to make them responsible.<br />
I also set the <strong>maximum width of images to 80% (whatever value you like)</strong> of the text content width. Just note here for later uses, since Figma doesn't allow us to set this constraint.<br />
I’m not concerned about vertical height limits, as readers can always scroll down if needed.</p>
<p>After some trial and error, I've come up with this page design. It's not too complex but I'm proud of it.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250711172344.png" alt="" width="1024" height="557" style="max-width: 80%; height: auto; margin-left: auto; margin-right: auto;"/>
<p>The UI works perfectly ... as long as the screen width is higher than 520px. I set the minimum width for the content to 320px correctly in Figma. However, the sidebar width hasn’t been accounted for yet, not to mention the padding. So the actual minimum width is around 520px.</p>
<p>An easy yet elegant solution is to make the sidebar collapsible, you can see one in ChatGPT. I'll need to add an icon at the top-left corner and design an alternate UI for when it's triggered (basically just removing the sidebar). Now, my UI can display correctly even on 320px-wide screen.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250711204529.png" alt="" width="691" height="597" style="max-width: 80%; height: auto; margin-left: auto; margin-right: auto;"/>
<h2>Choosing a programming language for UI</h2>
<p>Now that the design is finished, it's time to make the interface accessible on a website. I can’t just give users the Figma link, you know? Technically, it's possible but far too inconvenient.</p>
<p>The most common approach is to choose a web hosting service and have it run some code. I'll deal with the coding part first, since I can test the UI and logic locally before publishing to any hosting platform.</p>
<p>To build the UI, I plan to use HTML, CSS and Javascript, as they are the standards for all web browsers. However, I learned them in my universitiy, so I want to try something new instead. I'm going with <a href="https://svelte.dev/">Svelte</a>, a Javascript framework known for its compact syntax. A framework like this can translate high-level code into HTML, CSS and vanilla Javascript, which helps reduce development time.</p>
<p>After all, frameworks are just tools, they're meant to make your job easier. Choose whatever you like best, as long as it gets the job done.</p>
<h2>Exploring a Svelte project</h2>
<p>Let's get started with the official Svelte document: <a href="https://svelte.dev/docs/kit/introduction">Getting started</a>. It seems I need to install <a href="https://docs.npmjs.com/about-npm">npm</a> first.</p>
<p>After running <code>npx sv create &lt;app-name&gt;</code> and <code>npm install</code>, npm creates an enormous number of files, that's one thing I dislike about web development. Let's go through each file and understand its main function. This may come in handy when I want to change Svelte's default behavior later on.</p>
<ul>
<li><code>README.md</code>: documentation file</li>
<li><code>package.json</code>: manifest file, where I define the app name and some dependencies (Svelte in this case)</li>
<li><code>package-lock.json</code>: auto-generated file after running <code>npm install</code>. It's used by npm to monitor the version of all dependencies.</li>
<li><code>svelte.config.js</code>: Svelte configuration
<ul>
<li><code>preprocessor</code>: used to translate high-level to vanila code.</li>
<li><code>adapter</code>: used for deployment, I'll look at it later.</li>
</ul>
</li>
<li><code>tsconfig.json</code>: TypeScript configuration. TypeScript acts as an intermediate language between Svelte and Vanilla, I won't go into details.</li>
<li><code>vite.config.ts</code>:  Vite (preprocessor) configuration. It seems I can define the host port in this file, which is a bit odd. I thought the preprocessor should translate the code only and do nothing more.</li>
<li><code>.npmrc</code>: npm configuration. I have nothing to do with this, just leave it as is.</li>
<li><code>.svelte-kit</code> and <code>node-modules</code>: auto-generated folders. They are code of the dependencies.</li>
<li><code>.gitignore</code>: specify files to exclude from Git version control, usually auto-generated files or confidential files (API keys, passwords, etc).</li>
<li><code>static/*</code>: all resources (photos, videos, fonts, etc) should go here.</li>
<li><code>src/*</code>: this is the main folder for the Svelte code. According to <a href="https://svelte.dev/docs/kit/project-structure">the official document</a>, only <code>src/routes</code> and <code>src/app.html</code>are required.
<ul>
<li><code>src/app.html</code>: the scaffold for the UI code. I should keep it unchanged, except for the icon part.</li>
<li><code>src/routes</code>: the main Svelte code goes here, I'll gradually explore it in the next section.</li>
</ul>
</li>
</ul>
<p>Let's run <code>npm run dev</code> in the terminal. Sweet, I can open the website on <a href="http://localhost:5173/">http://localhost:5173/</a>.</p>
<h2>Creating the UI with Svelte</h2>
<p>Official tutorial link: <a href="https://svelte.dev/tutorial/kit/introducing-sveltekit">Introduce Sveltekit</a>.</p>
<p>Let's stop at the Routing section. This is more than enough to implement the UI.<br />
Here are some quick notes:</p>
<ul>
<li><code>+layout.svelte</code> in folder <code>routes/X</code> is the common UI for <code>/X</code> and all its subpath.
<ul>
<li>In my case, this is the left navigation panel (or sidebar)</li>
</ul>
</li>
<li><code>+page.svelte</code> in folder <code>routes/X</code> is the distinct UI for path <code>/X</code>
<ul>
<li>In my case, this is the main content area.<br />
I need to define the path schema for all pages beforehand:</li>
</ul>
</li>
<li><code>/</code>: homepage</li>
<li><code>/lists?tag=&lt;something&gt;</code>: post lists. This takes <code>tag</code> as a parameter for the tag filter (default <code>all</code>).</li>
<li><code>/post/[post-id]</code>: a post. Why don't I use a parameter instead? Because I don't have a default value. If an id is invalid, I must throw an error UI.</li>
</ul>
<p>Now I'll export the Figma as PNG and ask ChatPT to generate UI code for me. It saves me some time, though I still need to verify and fix the code later.</p>
<p>Here are some things I learnt while investigating the generated code.</p>
<ul>
<li>Use <code>rem</code> instead of <code>px</code> for padding, margin and text-related attributes, since this unit will adjust automatically when users scale the browser size.</li>
<li>Some text blocks (<code>p</code> or <code>headers</code>) have default margin, remember to disable if I don't need them.</li>
<li>Although Google recommends <code>display=swap</code>when using Google Fonts, I turn it off as it causes <strong>flash of unstyled text (FOUT)</strong>. The only downside is that readers may wait longer to see the content, which is more acceptable in my opinion.</li>
<li>use Svelte's <code>$state</code> and CSS's <code>transition</code> for the sidebar animation.</li>
<li>Use JS's <code>MediaQuery</code> and Svelte's <code>onmount</code> to access the screen width and listen to its change.</li>
</ul>
<h2>Fixing the sidebar animation on the first render</h2>
<p>Problem:<br />
<strong>The sidebar always runs the collapse animation when I first open the site on a mobile device.</strong><br />
This is the biggest obstacle I've dealt with while developing the UI.</p>
<p>Root cause:<br />
A <code>$state</code> in Svelte always expects a default value, as the UI is prepared using this value. In my code, <code>expanded</code> is the default state. This state is then changed to <code>collapsed</code> when the check code runs on a mobile device.<br />
The animation is the transition from <code>expanded</code> state to <code>collapsed</code> state.</p>
<p>Solution:<br />
Just change the default state based on screen width is enough, right?<br />
Sadly, no. I can't retrieve the screen width until the UI is attached to the screen. And I must define the default value before that happens.<br />
Which default value should I choose?<br />
Both <code>expanded</code>and <code>collapsed</code> only works in one case and fails in others.</p>
<p>Am I stucked now?<br />
Let's think in another way.<br />
I can see the animation, which means the state is updated AFTER the screen is first rendered. So the execution order may be:</p>
<ul>
<li>default state -&gt; attach UI -&gt; render first -&gt; update state -&gt; render second.<br />
The state update is handled by <code>$state</code>, finding workarounds may cause a mess.</li>
</ul>
<p>How about changing the first render without using <code>$state</code>? I am able to get the screen width by this step.<br />
After trial and error, the solution is feasible by using traditional CSS with <code>@media</code>. I need another state to describe this behavior, let's call it <code>default</code>.</p>
<p>In summary, all three states are rendered as follows:</p>
<ul>
<li><code>default</code>: 0 if screen width &lt; 520px, else 200px</li>
<li><code>expanded</code>: 200px</li>
<li><code>collapsed</code>: 0px</li>
</ul>
<p>The completed code can be found in this <a href="https://github.com/pntt3011/pntt3011.github.io/tree/0df8e987f2e297d05d4fd4a404c92ec08292ff17">commit</a>.</p>
<h2>Creating my first database</h2>
<p>Remember the data diagram above, let's make another version. This time I'll ask whether a data persists or not when readers close the website.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250714151905.png" alt="" width="1024" height="435" style="max-width: 80%; height: auto; margin-left: auto; margin-right: auto;"/>
<p>Why do I need this?<br />
All persistent data must be available somewhere before users can see them.</p>
<ul>
<li>For example, I need to write a blog before my code reads it and exposes to users.<br />
All temporary data is intialized on the fly by business logic.</li>
<li>Normally, most of it is handled automatically by our browers and HTML components.</li>
<li>In this case, I only need to implement the highlight logic by myself.</li>
</ul>
<p><strong>In general, developers care more about persistent data. Whenever they refer &quot;data&quot;, they usually mean &quot;persistent data&quot;.</strong></p>
<p>I'll start with the homepage first, as it doesn't connect to any other data. I just need to write some lines about myself and this blog.</p>
<p>The post content and its components will be my next target, because they only connect to the post data. The schema should be an ordered list, like:</p>
<pre><code>1. Header: This is the first header
2. Paragraph: this is some content
3. Header: This is the second header
4. Ordered list: This is a list
	1. First item
	2. Second item
5. Photo: This is an url
6. etc
</code></pre>
<p>I usually write the drafts in <strong>Markdown</strong>. Manual copying every components seems repetitive. Can I translate them automatically into HTML?</p>
<p>First child first level<br />
render into svelte<br />
Ordered list<br />
break new line<br />
Css not nested<br />
param or predefined<br />
pip install markdown-it-py[plugins]<br />
pip install markdown-it-py[linkify,plugins]<br />
render pipeline<br />
Render photo<br />
wrap photo with image-box<br />
Copy photo<br />
handle file not exists<br />
regex<br />
handle 80% width<br />
gfm like</p>
<p>optimize photo</p>
<ul>
<li>loading lazy</li>
<li>Layout shift: <a href="https://www.youtube.com/watch?v=KfTAvFwhO7s">https://www.youtube.com/watch?v=KfTAvFwhO7s</a></li>
</ul>
<p>layout shift</p>
<p><a href="https://spec.commonmark.org/0.31.2/">https://spec.commonmark.org/0.31.2/</a><br />
It is a text file with some special symbols to denote whether a text is a header, a paragraph, etc. It also supports more formats such as code blocks or bold text</p>
<p>Before I actually generate some data, I need to ensure the constraints between them. This is achievable by using <strong>schemas.</strong></p>
<h2>Add title</h2>
<h2>Conclusion</h2>
<h2>Further reading</h2>
<p>Responsive UI:</p>
<ul>
<li><a href="https://www.youtube.com/watch?v=fghWUZfkyew">https://www.youtube.com/watch?v=fghWUZfkyew</a></li>
</ul>
<p>Auto layout:</p>
<ul>
<li><a href="https://www.youtube.com/watch?v=aYRoHooj0hg">https://www.youtube.com/watch?v=aYRoHooj0hg</a></li>
<li><a href="https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout">https://help.figma.com/hc/en-us/articles/360040451373-Guide-to-auto-layout</a></li>
</ul>
<p>Svelte:</p>
<ul>
<li><a href="https://svelte.dev/tutorial/svelte/welcome-to-svelte">https://svelte.dev/tutorial/svelte/welcome-to-svelte</a></li>
</ul>
<hr />
<h1>Questions</h1>
<hr />
<h1>References</h1>

		</section>
	
		<style>
		.post-content {
			display: flex;
			flex-direction: column;
		}

		h2 {
			color: #000;
			font-weight: bold;
			font-size: 1.25rem;
			line-height: 2rem;
		}

		.post-content ul,
		.post-content ol {
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
		.post-content > ul > li:first-child,
		.post-content > ol > li:first-child,
		.post-content .image-box {
			margin-block-start: 1.5rem;
			margin-block-end: 0;
		}

		</style>
	