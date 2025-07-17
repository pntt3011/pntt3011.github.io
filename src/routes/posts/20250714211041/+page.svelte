
		<section class="post-content" style="display: flex; flex-direction: column;">
		
<h2>TLDR</h2>
<p>This post doesn't deep dive into using any specific tool or framework. It's more about how I frame my problem and design a solution for it.</p>
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
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250709154252.png" alt="" width="507" height="569" style="width: auto; max-height: 70vh; margin-left: auto; margin-right: auto;"/>
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
Ask yourself &quot;If the relevant value changes to something random, do the core features still work as expected?&quot;.</p>
<ul>
<li>If no, then it involves business logic.</li>
<li>If yes, it's likely pure UI logic.</li>
</ul>
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
<li>n - n: e.g. one post contains many tags, and one tag can appear in many posts.</li>
</ul>
<p>Here is the data diagram of my blog (credit to <a href="https://www.tldraw.com/">tldraw</a>, again)</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250714090725.png" alt="" width="1024" height="482" style="max-width: 80%; height: auto; margin-left: auto; margin-right: auto;"/>
<p>Why do I need this diagram?<br />
The relationships demonstrate the contraints among the data, which creates data consistency. Without this diagram, I may show a tag that no post have or a post with no title. I'll discuss more later in the database section.</p>
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
<h2>Exploring a template project</h2>
<p>When I learn a new framework, I'll generate a demo project to see how the files are structured. I also go through each file and briefly explore its main function. This may come in handy when I want to change the default behavior later on.</p>
<p>(Optional) Here are basic files of a Svelte project.</p>
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
<h2>Developing the UI</h2>
<p>Before getting started, let's answer this question: How is each UI accessible from the blog?<br />
As I can see from the data diagram, the homepage, post lists and posts are distinct by the endpoint. And the endpoint for a website is basically its URL.</p>
<p>With that in mind, I define the URL schema for all interfaces. Users can access any UI by opening the associated URL.</p>
<ul>
<li><code>/</code>: homepage</li>
<li><code>/lists?tag=&lt;something&gt;</code>: post lists. This takes <code>tag</code> as a parameter for the tag filter. If no tag or tag &quot;all&quot; presents, it shows all blogs.</li>
<li><code>/post/&lt;post-id&gt;</code>: a post. Why don't I use a parameter instead? Because I don't have a default value. If an id is invalid, I must throw an error.</li>
</ul>
<p>Now I'll export the Figma as PNG and ask ChatPT to generate the code for me. It saves me lofs of time, though I still need to verify and fix the code later.</p>
<p>(Optional) Here are some things I learnt in the progress.</p>
<ul>
<li>Use <code>+page.svelte</code> and <code>+layout.svelte</code> to handle routing.</li>
<li>Use <code>rem</code> instead of <code>px</code> for padding, margin and text-related attributes, since this unit will adjust automatically when users scale the browser size.</li>
<li>Some text blocks (<code>p</code> or <code>headers</code>) have default margin, remember to disable if I don't need them.</li>
<li>Although Google recommends <code>display=swap</code>when using Google Fonts, I turn it off as it causes <strong>flash of unstyled text (FOUT)</strong>. The only downside is that readers may wait longer to see the content, which is more acceptable in my opinion.</li>
<li>use Svelte's <code>$state</code> and CSS's <code>transition</code> for the sidebar animation.</li>
<li>Use JS's <code>MediaQuery</code> and Svelte's <code>onmount</code> to access the screen width and listen to its change.</li>
</ul>
<h2>Issues while developing the UI</h2>
<p>This is the biggest obstacle I've dealt with while developing the UI.</p>
<p>Problem:<br />
<strong>The sidebar always runs the collapse animation when I first open the site on a mobile device.</strong></p>
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
<li>default state -&gt; attach UI -&gt; render first -&gt; update state -&gt; render second (<code>expanded or collapsed</code>).<br />
The state update is handled by <code>$state</code>, finding workarounds may cause a mess.</li>
</ul>
<p>How about changing the first render without using <code>$state</code>? I am able to get the screen width by this step. If I can display the right UI here, then no animation will run in the second render.<br />
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
<p>I'll start with the homepage first, as it doesn't connect to any other data. I just need to write some lines about myself and this blog. This is the easiest part in this section.</p>
<p>The post content and its components will be my next target, because they only connect to the post data. A post is an arrangement of headers, sections, lists and photos. So the schema must be an ordered list, like:</p>
<pre><code>1. Header: This is the first header
2. Paragraph: this is some content
3. Header: This is the second header
4. Ordered list: This is a list
	1. First item
	2. Second item
5. Photo: This is an url
6. etc
</code></pre>
<p>I just need to translate the corresponding components into HTML elements and I am done, right?<br />
Yes, but look at it in long term. Manual defining every components seems repetitive and tedious. I usually write the drafts in <strong>Markdown</strong>. Can I convert them automatically?<br />
I think this is feasible, as Markdown has special symbols to denote where is a text is header, a paragraph, a list, etc.</p>
<p>Let's draw the pipeline first to have a rough picture of what I'll do.</p>
<ul>
<li>Parse symbols in Markdown -&gt; Sort them in order -&gt; Translate into HTML elements.</li>
</ul>
<p>If I can automate these steps, I don't have to sit all days just to copy every texts. I can spend that time to go for a walk (or write another blog).<br />
Luckily, Python has a perfect library for that: <a href="https://markdown-it-py.readthedocs.io/en/latest/index.html#">markdown-it</a>. And it does exactly the same as my imagine pipeline. I can write a Python script to automate these steps.</p>
<p><strong>Python is a perfect tool to automate tasks. I highly recommend learning it for this purpose.</strong></p>
<p>After running on some test files, I discover another problem. As I use local photos in my Markdown files, the HTML cannot load these images due to security reasons. That would be scary if a website can access any data on my computer, right?<br />
Let's copy the photos to the project resource folder, usually named <code>static</code>.  I also automate this process using the above Python script.</p>
<p>I've included the Python script in the source code of this page. Feel free to check this, I appreciate any suggestions for improvement.</p>
<h2>Issues while testing on some data</h2>
<p>This problem is not as hard as the sidebar one, but it's worth mentioning.</p>
<p>Problem:<br />
After any photo is loaded on a post, I can notice a jarring effect shifting the below texts.</p>
<p>Root cause:<br />
HTML only knows how much space those photos will take only after they're loaded. The jarring effect happens when the web allocates space for these photos.</p>
<p>Solution:<br />
How to let the UI know how much space to reserve in the beginning?<br />
After using Google, the first anwswer to appear is defining the width and height manually. This should be easy as I can know the dimension of each photo beforehand. However, this solution will make the photos unresponsive. Is there another way?<br />
Yes, I find that defining <code>max-width</code> or <code>max-height</code> along with width and height solves the problem. This makes the photos scalable when users change the screen size. But there is still a small last step before I reach the perfect solution.</p>
<p>Which width percentage should I define?<br />
As I mentioned before, a photo should take maximum 80% of the area width. This is reasonable for landscape photos. But how about portrait photos? Their widths should be shorter so that they don't appear to large on screen.<br />
Why don't I use 80% of the area height? Remember that the blog content is scrollable.<br />
How about 80% of the screen height? I've never thought of this option before. Let's use 70%, cause I think 80% is still too large for a photo height.</p>
<p>Let's sum up the solution:</p>
<ul>
<li>If landscape photo, a photo width takes maximum 80% of the area width.</li>
<li>If portrait photo, a photo height takes maximum 70% of the screen height.</li>
</ul>
<p>The point I want to make here is that, you can come up with more efficient solution later. So don't hestitate to break what you defined before.</p>
<h2>Creating my first database (Part 2)</h2>
<p>Let's continue from where I left off. Now that I've finished desiging the post contents and homepage content, only the post metadata and tags are remained. I'll begin with the post metadata first.</p>
<p>From the above data diagram, beside a post content, I need to intialize a title, a preview text, a creation date and some tags for any blog. The first solution I come up with is utilizing the Markdown file and the Python script above to convert them into HTML elements.</p>
<p>There seems to be no problem, right? ... Not yet.<br />
A post is associated with an area in the post list. I should show the post's title, preview text and creation date there. How can I get these information if they lie in the post content only?<br />
How about generating the post list along with the post content using Python?<br />
That's exactly what I intent to do now. But I just need to generate the data only (in JSON format) and Svelte will populate them on the UI for me. When filtered, I just need to hide unrelated posts.</p>
<p>Now that we have two places declaring a post's title, one in the post content and one in the post list. The same goes with creation date, preview text and tags. They are generated from the same Markdown file so there should be no discrepancy.  <strong>There is nothing wrong with this approaching.</strong> I'm just not satisfied with it and want to remove duplicates, so I decide to move them into a separate JSON file and read this information from both places.</p>
<pre><code>	'title': string,
	'preview': string,
	'creation_time': number,
	'tags': []
</code></pre>
<p>Look like I forgot something. Ah. In the last sections, I've decided that users can access a post by opening the URL <code>posts/&lt;post-id&gt;</code>. I need to define a <code>post-id</code> for each blog. Both the title and creation time are good candidates. I'll use creation time in this situation as it's more compact than the title.</p>
<p>A challenge question for you: Can I move the post content into the JSON file? And should I do it?<br />
If I do that, the browser will load the content of <strong>ALL</strong> posts when loading the post list. Think about the memory capacity, you should have the answer.</p>
<p>Finally, I only have the &quot;tags&quot; data left. Another question: Do I really need to generate one? Isn't already available in the &quot;posts&quot; data?<br />
<strong>It's totally fine to derive the tag data from the post data</strong>. Users are likely to open the post list anyway so loading the data first should be more efficient. However, since I have bad impression of Javascript and HTML syntax, I want to write them as least as possible. I'll create another JSON file so that I can show directly what I read.</p>
<pre><code>	'tag': string,
	'count': number
</code></pre>
<p><strong>Remember to automate the JSON step with Python too.</strong></p>
<h2>Implementing the business logic</h2>
<p>The journey is coming to an end. I need to connect the UI with its corresponding data and I'm done. Just going through each logic and following the framework documents are enough. The only things I've touched yet is to highlight the active label. Let's finish it.</p>
<p>Here is the <a href="https://github.com/pntt3011/pntt3011.github.io/tree/8773d1b8428d265fd3e3cbab6796ba9ccd90e493">link</a> for all the code up until now.</p>
<h2>Deployment</h2>
<p>Remember I mentioned letting some services running the code before?<br />
This is that time.</p>
<p>Which <strong>KIND</strong> of service should I choose? You ask.<br />
Let's compare the two data diagrams. I can notice a similarity: all persistent data can only be updated by me.<br />
<strong>This type of website is called <code>static</code></strong>, which means there exists a <code>dynamic</code> counterpart. But that's for another day. Just Google &quot;host static website&quot; and you'll be given numerous services. This step is tool-specific so I won't comment much.</p>
<p><strong>Remember to follow the Javascript framework guideline for deployment.</strong></p>
<h2>Conclusion</h2>
<p>This is too long for a post, I admit, mainly because I want to publish it along with the blog. Next time, I'll break long posts into smaller parts. It also creates a better sense of accomplishment than publishing one big post all at once.</p>
<p>Before you leave, here are some takeaways, I hope they’re useful to you:</p>
<ul>
<li>Steps to solve a problem:
<ol>
<li>Define the criteria that need to be met (Objectives and Core Features)</li>
<li>Visualize the desired outcome based on those criteria (Designing the UI)</li>
<li>Visualize the steps to achieve each criterion, and how they interact with each other (Business Logic and Data Diagram)</li>
<li>Start with what you can build now (Database, UI Framework), and build up from there.</li>
<li>Mistakes are expected, don't hestitate to change what you defined ealier.</li>
</ol>
</li>
</ul>
<p>Thanks for reading!</p>

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
	