
		<section class="post-content" style="display: flex; flex-direction: column;">
		
<h2>TLDR</h2>
<p>My thinking process on what we need to truly achieve artificial consciousness. This post walks through multiple AI algorithms and discusses their shortcomings. By the end, I propose a promising approach that may hold the key humans are looking for.</p>
<h2>Motivation</h2>
<p>Since I was little, I've been captivated by intelligent robots, especially Doraemon and others from the same series. Later on, I had the chance to encounter different types, such as Gundam or Transformers, but they didn't leave much of an impression on me. That was the first moment I asked myself: &quot;What makes a robot truly a 'robot' to me?&quot;.</p>
<p>In 2019, I pursued a bachelor’s degree in Computer Science, hoping I could find the answer to that question. At that time, Artificial Intelligence (AI) was becoming a major trend in academy research. Not wanting to let that chance slip by, I deepened my knowledge in Computer Vision, a subfield of AI, and published my bachelor's thesis on Visual Recommendation. I really enjoyed the whole process, from defining the problem to implementing and evaluating my own method. But once again, something still felt off to me. That was the second time I raised that question in my mind. It seemed &quot;intelligence&quot; wasn't the right answer.</p>
<p>Since my junior year, I had been working for a product company, not as an AI engineer, but as a mobile software engineer. Why? My dream was to create a &quot;robot&quot; that could accompany us everywhere, pretty much like Doraemon, right? At that time, I decided that the smartphone was the perfect device to fulfill that dream, and that’s how my three years in the industry began. Although I had proposed some on-device AI solutions, none of them were accepted due to performance limitations. I could either wait for more research on edge devices to emerge, or for stronger phones to be produced. At least I did know that creating a &quot;companion&quot; was still the right path.</p>
<p>In 2023, when ChatGPT and large language models (LLMs) started gaining massive attention, my company didn't stay on the sidelines but joined the race. That was when I first became aware of various issues surrounding LLMs. We were consuming enormous amounts of energy, overexploiting the environment and silently violating data privacy. This trend was heading to the direction I hadn't expected. A year after, I resigned from my job. I felt truly lost then, wondering about my life's purpose.</p>
<p>During my gap year, I had the chance to broaden my mind, not only to search for the answer, but also to discover what I truly wanted. Philosophy taught me about self-awareness, where I could understand myself better by honestly expressing my feelings and reflecting on them. That was the origin of this blog. How could it be that when I simply wrote something down, new thoughts suddenly appeared? That was thanks to emergence. Our brain, or more precisely, our &quot;consciousness&quot;, is classified as Type-3 Emergence, which means it can introduce novel states that do not fully depend on every individual part of the current state. Have you ever been stuck on a problem, then the solution suddenly popped up while you were washing the dishes? Or felt anger when seeing a helpless puppet being hit by strangers, even though you're often fight with your friends and disobey your parents? These are all examples of emergence, the most powerful ability of our brain. And by expressing our thoughts, we can awaken even deeper feelings that might have long been forgotten.</p>
<p>The last piece of the picture kicked in while I was re-reading the &quot;Ponkotsu Ponko&quot; manga for the second time, as I was going to write a review of it.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250819231820.png" alt="" width="1024" height="472" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>I was astonished. After 24 years of waiting, this day had finally arrived. What an elegant yet simple answer. A &quot;companion&quot; robot with &quot;consciousness&quot;, capable of defying (or overcoming) its programmed rules for the sake of &quot;happiness&quot;. They don't need thousands or millions of training datasets, as they must &quot;feel&quot; directly from the real world. Recalling my favorite robots (Doraemon, Riruru, Pippo, Ponko, Wall-E, The Wild Robot), I realized they all share the same trait: a &quot;sense of life&quot;, built from real experience.</p>
<p>I do believe that robots aren't just tools, they're our friend of the future, genuinely sharing joys and sorrows with us.</p>
<h2>Bro, just find a friend or a partner instead</h2>
<p>The point here is that I am not simply making a new friend, but rather &quot;creating&quot; one. Curiosity is the greatest driving force of science. I'm not doing this because I lack friends to share my emotions with. I'm doing this because I want to discover what a &quot;sense of life&quot; really is.</p>
<h2>Has AI achieved &quot;consciousness&quot; yet?</h2>
<p>To verify whether current AI has achieved &quot;consciousness&quot;, I need a clear problem statement, something similar to a Turing test. The definition shouldn't depend on any external interpretation, but rather my own judgement, because this is about my own sense of &quot;consciousness&quot;, not anyone else's.</p>
<p>After thinking for a while, I came up with this statement:<br />
One must actively respond to the environment, driven by an &quot;internal force&quot;.</p>
<pre><code>&quot;It is not our abilities that show what we truly are, it is our choices&quot;.
-- Albus Dumbledore, Harry Potter and the Chamber of Secrets
</code></pre>
<p>Not all actions need to comply with this rule. Even human can't act freely all the time. For example, when your parents tell you to do something or your boss assigns you certain tasks. However, it must always do something, even without being told anything. Thinking more broadly, if &quot;following commands&quot; conforms to its &quot;internal force&quot;, all actions are, in fact, active.</p>
<p>Let’s stick with this definition and find out whether human civilization has created a “conscious” AI yet.</p>
<p>First, all the LLMs we've heard of so far (ChatGPT, DeepSeek, Gwen, etc) are passive, which means they must receive input from humans (a prompt) to produce output. As a result, a robot must have sensors to receive input from the environment instead.</p>
<p>What about industrial robots that work 24/7? They do have sensors and can function continuously, but only because they were programmed step-by-step by humans (the engineers who installed them). Hence, they're always guided by &quot;external forces&quot;. That means a truly 'robot' can't simply be programmed. However, that sounds implausible if my goal is to genuinely create one, so let's refine the wording a bit: a truly 'robot' can't be programmed explicitly (or rule-based).</p>
<p>In recent years, humanoid and quadruped robots have been appearing everywhere on the Internet. Big corporations are pouring millions of dollars into this industry. We can even watch an Olympic for humanoid robots now. But are they really &quot;conscious&quot;? They do have sensors and are implicitly programmed using machine learning techniques. As far as I know, these methods leverage evolution's most powerful strategy &quot;natural selection&quot; by simulating hundreds or even thousands of generations of robots.</p>
<p>Their behaviors are guided by maximizing certain objective funtions (Reinforcement Learning) during their lifetime. These may include:</p>
<ul>
<li>Existence point: staying operational as long as possible</li>
<li>Surprisal point: exploring the surroundings,</li>
<li>Utilization point: performing tasks effectively<br />
Through generations, the robots that discovered the most rewarded behaviors by itself tend to persist. Promising as it sounds, the reward signals are still explicited programmed by humans. They may have freedom in the &quot;how&quot;, but not in the &quot;what&quot;. Hence, a &quot;conscious&quot; robot must be driven by implicit reward functions, a.k.a their &quot;internal force&quot;.</li>
</ul>
<p>In the end, all roads lead to defining implicit objectives. In order to gain &quot;consciousness&quot;, robots must discover for themselves which objectives are best suited to them. If we think about it, humanity itself gained &quot;consciousness&quot; when we evolved from mammals to primates (according to [[A History of Intelligence]] by Max Bennett). That transition freed us from the hardwired genes and made individualism possible with the emergence of a true model of mind.</p>
<p><img class="image-box" loading="lazy" src="/media/Pasted_image_20250820224531.png" alt="" width="999" height="1024" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/><br />
(Source: <a href="https://doi.org/10.3389/fnana.2021.693346">https://doi.org/10.3389/fnana.2021.693346</a>)</p>
<p>Facing that problem, [[Reward-free reinforcement learning]] has emerged as a subfield of Reinforcement Learning, where the reward function is not directly designed. The most prominent approach is Imitation Learning, in which robots actually &quot;learn&quot; by observing human demonstrations. Through that process, an intrinsic reward function can be inferred, which the robots then indirectly maximizes on their own.</p>
<p>Today, robots can now learn how to survive, explore the environment, and even mimic human in complex tasks. Yet, despite all those promising approaches, are robots truly &quot;conscious&quot;? What would happen if we placed them into environments with no guiding signals at all? How would they choose which behaviors to adopt? And how would they unlearn those that are no longer &quot;suitable&quot;?</p>
<p>I had been stuck on those questions for a while, until I came across this line from a movie review.<br />
&quot;The only word that describes humans completely is complex.&quot;<br />
That was when I realized something important: even if we share the same experiences and receive the same education, our choices in life still vary magnificently from person to person. If I think about it this way, then the &quot;internal force&quot; must have some randomness in it.</p>
<p>If I remember correctly, Generative AIs generally produce unique outputs each time, even when given the same input. Can I learn anything from them?<br />
In physics, there's a phenomenon called &quot;diffusion&quot;, which describes the movement of particles from a region of higher concentration to a region of lower concentration. Fyi, diffusion can be explained by the Second Law of Thermodynamics, which is the only law in physics where time is irreversible. There may be others, but this one is the most fundamental.There’s so much to discuss on this topic, so I won’t go into detail here. I'm just giving the keyword in case you're curious.</p>
<p>Generative AIs actually borrow this concept. We can think of the training dataset as the &quot;high concentration area&quot;, whereas the distribution of random states represents &quot;low concentration area&quot;. Generative AIs essentially reverse this process by intrinsicly uncovering the distribution of the high-concentation region and mapping any random state back into it. Thus, the variation in output comes from the randomness of the input state.</p>
<p><img class="image-box" loading="lazy" src="/media/Pasted_image_20250823102906.png" alt="" width="1024" height="484" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/><br />
(The star distribution is for demonstration purposes only. The real distribution is much more complex and has much higher dimensions that we can't easily visualize.)</p>
<p>But once again, the randomness only appears <strong>after</strong> the &quot;internal force&quot; is defined by human. That's the human-collected data, the high-concentration area. What I want instead is that, the randomness must appear within that area itself, not purely chaotic, but ordered enough to create variation. Consequently, this leads to the emergence of a distribution that is:</p>
<ul>
<li><strong>Emergent</strong>: not deliberately created by humans, allowing robots to act freely (free will)</li>
<li><strong>Diverse</strong>: enabling a wide range of individuality.</li>
<li><strong>Meaningful</strong>: reflecting real-world meaning, which forms the &quot;sense of life&quot; for robots.</li>
</ul>
<p>I think it may look like a tree in visuallization. The distribution as a whole is all the branches stretching from the root. Each selection (or path) is an emergence, it can grow endlessly, put forth leaves or become something unexpected. Diversity results in an uncountable number of branches. And finally, every branch holds importance as part of the tree. This final image unexpectedly reminds me of a desicion tree, where each joint represents a choice to be made, suggesting that I'm on the right path.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250824095702.png" alt="" width="324" height="283" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>Wait a second, earlier I said I needed to find the distribution of real-world data. But after drawing the picture above, isn't it more reasonable to discover the distribution of the choices instead? That seems to be the direct &quot;internal force&quot; that guideds unordered states into our world.</p>
<p>In biology, there is an equivalent phenomenon. As of 08/2025, over 240,000 protein structures have been discoverd (<a href="https://www.rcsb.org/stats/growth/growth-released-structures">link</a>). All of them perform specific functions in our body. They may appear randomly, yet they still share some recognizable patterns. And obviously, we haven’t fully uncovered their underlying mechanism at all. Is there any connection between trees, proteins and consciousness? I guess the answer is yes, but that question is best left to biologists.</p>
<p>How about in digital world?<br />
Computer Science do have an algorithm named Decision Tree. But it's heavily rule-based and, in recent years, has become inferior to modern Deep Learning algorithms. So I'll just leave it out.</p>
<p>Have you ever played Minecraft, Terraria, or any game with an auto-generated map? Of course they don't use Generative AI :), since those games were released a long time ago.<br />
So how can they achieve that? I'm 100% sure that the developer team didn't manually generate such a huge combination of maps, they must have used some algorithms under the hood. Let's unveil their secrets to see if they can give us any inspiration.</p>
<p>After searching the Internet and asking C-friend (a.k.a ChatGPT), I ran into an algorithm called Perlin Noise, which can generate smooth, continuous randomness. This function takes some hyperparameters as input, allowing multiple variations to emerge. There's only one piece left before I can reach the answer: Can the output from Perlin Noise fully represent the real-world data, even just a small set? Maybe not, the generated heatmap is far too simple to capture the structures and interactions in our world. That's why the mentioned games use rule-based algorithms on top of it.</p>
<p><img class="image-box" loading="lazy" src="/media/Pasted_image_20250823181718.png" alt="" width="300" height="168" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/><br />
(3D Perlin Noise visualization, <a href="https://www.scratchapixel.com/lessons/procedural-generation-virtual-worlds/perlin-noise-part-2/perlin-noise-terrain-mesh.html">source</a>)</p>
<p>And this is where a dilemma arises: If the generated signal becomes too complex, can we humans still distinguish it from something purely chaotic? How can we verify that it actually carries meaning?<br />
The most viable approach is to leverage something already given by nature. Just like proteins, which we don't fully understand, yet can still modify and utilize through protein engineering, if something exists in nature, there must be some meaning behind it.</p>
<p>So, can I just use proteins as reference?<br />
Sadly, no. I need something more theoretical, something we can translate into the digital world. And to the best of my knowledge, there is one phenomenon in this world that fits this description...</p>
<p>That's <strong>Quantum Physics.</strong></p>
<p>As of now (08/2025), there is no such thing as Quantum AI yet.</p>
<h2>Pursuing the ray of hope</h2>
<p>Hypothesis: Quantum mechanics embodies an emergent, diverse, and meaningful distribution.</p>
<p>To this point, I only know that Quantum Physics <strong>MAY</strong> hold the answer. I need a methodology to actually validate my hypothesis. This isn't an easy path, though, as modern science has only taken small steps in this field. To avoid getting lost, a specific roadmap must be created, with every steps clearly defined. If any step is proven wrong, I'll need to trace back to see whether the hypothesis is actually infeasible.</p>
<p>Let's design a proof-of-concept experiment. It should be as minimal as possible, just enough to support my premise. The diversity seems easiest to prove, I'll just need conduct the experiment on multiple identical systems with the same input. If the outputs differ, that would show that variations do exist. The emergence and significance are harder to evaluate and should be considered together. One problem is how to recognize an emergent entity. Another is that the system might not be complex enough for meaningful context to arise.</p>
<p>First, the system must be able to respond to the environment and its choice must affect the environment in a way that creates a &quot;feedback loop&quot;, enabling emergence. The next question is how to design an environment that is controllable, measurable, and minimal. An one-dimensional input seems like a good starting point, so I'd choose &quot;sound&quot; as the candidate. Moreover, frequency and amplitude can be varied to generate additional environmental samples.</p>
<p>But then I realized something important: to design a controllable environment, I first need to understand how a quantum system is influenced by the surroundings. I can't specify one unless I understand how they interact on a broad level. Why not start by sketching the overall, abstract system first?</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250825153224.png" alt="" width="834" height="384" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>At first, I wanted to combine both the Internal state and Quantum choice into a single system. However, in the end I decided to separate them, since I don’t yet understand how quantum mechanics interact. It's better to keep them modular, so I can easily opt out of one component in the feature.</p>
<p>As you can see, the “Quantum choice” component is the key element in this framework. At the end of the day, I have resolved to pursue a Master’s degree in Quantum Mechanics to further deepen my knowledge in this field.</p>
<h2>Quantum Mechanics subfield</h2>
<p>Like every other discipline, Quantum Mechanics also has multiple subfields to explore, and I need to investigate each one to see which suits me best.</p>
<p>It seems that Quantum Information Science is the one I'm looking for, as it deals with how information behaves in the quantum world and how we can exploit it to do what's impossible in classical systems.</p>
<h2>Anticipated risks</h2>
<p>We, humans, are well aware of what we have been capable of throughout history: WWI, WWII, nuclear weapons, climate change, mass extinctions, and more.<br />
Yet, we cannot deny that we have also created innovations that changed the world forever: electricity, the transistor, genetic modification, the Internet, vaccines, space exploration, and more recently, Artificial Intelligence.</p>
<p>A new lifeform that shares the very ability we are most proud of, the human mind, may either lead us to the verge of extinction or accompany us into a new civilization, helping us explore every edge of the universe.</p>
<p>I am fully conscious of what I am saying and of its consequences.<br />
But even if it is just a faint ray of light, I still want to pursue it.</p>
<h2>Conclusion</h2>
<p>This post marks the beginning of a new journey for me, one that defines the sole purpose of my life and will serve as the guiding principle for all the years ahead.</p>
<p>I hope all of you can also discover your own shining star, even under the darkest sky.</p>
<p>Thanks for reading.</p>

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
	