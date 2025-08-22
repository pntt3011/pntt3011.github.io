
		<section class="post-content" style="display: flex; flex-direction: column;">
		
<h2>TLDR</h2>
<p>If you just want the tool name, Syncthing + Tailscale. If you want to understand how these tools work, this post is for you.</p>
<h2>Motivation</h2>
<p>I have been using Obsidian as my note-taking tool for a while. So far, the experience is top-notch, I can't compliment it enough.</p>
<p>Lately, I need to travel here and there without my laptop. My phone is the only digital friend I bring along. I usually note some outlines in my phone and elaborate on the details later when I have access to my laptop.</p>
<p>It becomes more tedious as the number of fleeting notes increases. That's the reason I want to synchronize the Obsidian folder on my phone and laptop.</p>
<h2>Objectives</h2>
<ol>
<li>The folder content must be identical on the devices <strong>EVENTUALLY</strong> and <strong>AUTOMATICALLY</strong>. It not need to happen in real-time though.</li>
<li>In case of conflicts, I can manually choose which file to keep. Conflicts are unavoidable in synchronization, I need to pick a resolution strategy for those cases.</li>
<li>The solution must work as long as the devices are connected to the same network.<br />
The objectives are pretty straightforward, so I think there should be some ready-to-use solutions on the Internet.</li>
</ol>
<h2>Available solutions</h2>
<p>Let's travel around the Internet to find which can help us.<br />
The first solution showing up is buying Obsidian Sync, from the official Obsidian team. Not that I don't want to support the developer team, I also work in the computer field so I can understand why they do that. Everything needs money to survive. Server needs money to continue functioning. Human needs money to continue working.<br />
However, I have financial problems, hence I can't afford that price. Sorry Obsidian team.<br />
**If you can afford it, please buy the Obsidian Sync. **</p>
<p>After wandering around for some time, I notice a name that comes across multiple times, <a href="https://syncthing.net/">Syncthing</a>. It's free and open-source, perfectly fitting my requirements. I decide to give it a try.</p>
<p>The setting is quite easy and well-documented. What's interesting me more is how Syncthing works under the hood.</p>
<h2>How Syncthing works</h2>
<p>The team has published a <a href="https://docs.syncthing.net/users/syncing.html">post</a> about the underlying synchronization mechanism. I really appreciate and admire them for doing that. Open and free knowledge is always my dream and philosophy.</p>
<p>Without further ado, I will place a figure here to understand how it works in the big picture.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250814160013.png" alt="" width="998" height="191" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>These steps seem simple, but a lot of big-brain engineers behind them. Let's break down each step.</p>
<h2>Connection</h2>
<p>First question: Imagine this scenario, you and your friend are working for two secret organizations. You live in different dormitories. The dorm manager assigns you a new room every week. You are only to contact with people outside the dorm through the dorm manager. All of these things are for your safety's sake. How can you and your friend send mails to each other?<br />
P/s: You can have a meet-up with your friend to prepare a plan before working for those organizations.</p>
<p>This is actually the situation where we are facing. Our devices' IP (address on Internet) are concealed and updated regularly by the routers.<br />
Both devices must know the other's address for further communication.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250814162854.png" alt="" width="1024" height="315" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>But aren't them on the same network? They can just directly connect without router interference.<br />
You get the point here. In that case, dorm A and dorm B is indeed the same dorm. But we still need to deal with the &quot;rearrange&quot; part. You shouldn't just run into every room and ask &quot;hey, are my friend here?&quot; with the hope that your friend is here. And in reality, you can't do that with routers.</p>
<p>Many habit-level applications solve this issue by manually informing the IP address of one device to the other. But automation is one of our goal so this solution is not viable.</p>
<p>But I am able to send messages from my PC to Android through Messengers. So there must be a way, right?<br />
Absolutely. That is the same technique Syncthing applying.</p>
<p>All we need is a middle man, like a post office, or just the woman who sells drinks in front of your dorminory.<br />
Both of you know exactly where they are. You can simply tell them &quot;if anyone want to find you, tell them I'm at room ABC&quot; after the room rearrangement.<br />
Your friend goes there, asks where you are, and tells them the same thing.<br />
Voila, problems solve.</p>
<p>Wait, wait. Shouldn't we contact with outsider through the manager, does he even allow that type of messages?<br />
Great observation. That where the &quot;p/s&quot; shines. You and your friends must prepare some kind of cipher that only both of you understand beforehand. Indeed, in the world of Internet, this's called &quot;protocol&quot;.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250814170005.png" alt="" width="1024" height="309" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>However, that's not the end of this nuisance.<br />
The dorm manager also has his own room mapping.<br />
You live in room A, but he will send your mail from room X, and only give you mails sent to room X.</p>
<p>Since that's the case, we have to take an additional step:<br />
Send a mail to the middle man to know our &quot;proxy&quot; room.<br />
The full process is as follows:</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250814221159.png" alt="" width="1024" height="307" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>Syncthing already has its own middle man.<br />
If you don't trust them, you can setup your own middle man.</p>
<p>I trust them.</p>
<h2>Scanning</h2>
<p>Before synchronizing, we must know what we already have. That's what scanning does.<br />
&quot;Master yourself, master the enemy&quot;.</p>
<p>There are two types of scanning:</p>
<ul>
<li>Interval full scanning: once per hour.</li>
<li>On-update scanning: whenever a file is created, updated or deleted.</li>
</ul>
<p>One clever optimization from Syncthing team, they do not rescan the whole folder at once but randomly rescan each file at a given time window. That reduces the CPU workload magnificently.</p>
<p>After scanning, all the information such as filename, modified date, size are stored in a hidden table (invisible by default).</p>
<p>This should be enough, don't you think so?<br />
I thought the same thing, but then astonished by the Syncthing team.<br />
They take a step further by annotating which part of a file has changed. A file is split into multiple chunks. Then, each chunk is given an ID (you can search more about hashing).<br />
When synching later, they just send the updated chunk over the Internet.</p>
<p>Not only that, they also assign a version for each file.<br />
I questioned myself why they do that? Isn't modified time enough?<br />
The answer lies in the next section: Comparing.</p>
<h2>Comparing</h2>
<p>When two devices are connected, they start comparing the scanning tables.<br />
This process is also started on every file changes, too.</p>
<p>Given two scanning tables, how do you compare them?<br />
Or more specifically, how do you know which files to delete, create or update?</p>
<p>Given device A has file X and device B doesn't have it. How do Syncthing know that file is deleted or created?<br />
They don't mention it in the documentation, but I think a deleted file is updated with the deleted time and size 0 in the table.</p>
<p>How about rename? Does Syncthing know that it should rename instead of deleting and creating a new file?<br />
Honestly, I don't know. They don't mention this case either. But I believe they handle this case efficiently, maybe add another column named &quot;old name&quot; to the scanning table.</p>
<p>Now, let's proceed to the most interesting case: update.<br />
Just compare the modified date, right. Where is the interesting part?<br />
Consider this case, you have file X in both devices. You change that file on laptop. Then you fly to another country and your Android changes the time. You update that file on Android because you don't bring your laptop.<br />
Now you have finished your trip, go back to your home, open your laptop, wait for the file on laptop to synchronize with one in Android.<br />
Tada, the file on Android rolls back to the same as in laptop.</p>
<p>Because you updated the file in another timezone, the modified time might not be suitable anymore.<br />
That's why Syncthing performs versioning on each files, like mentioned in the previous section. This can be a number that is monotonic increase.</p>
<p>When comparing, the versions of a file from all versions will be compared, then one global version is chosen (usually the highest one).</p>
<p>If multiple global versions are found, like the example above, users must manually choose what version they want to keep (objecitve 2).</p>
<p>At the end of the comparing process, all files are marked with respective global versions, along with their local versions. Then, synchronization happens.</p>
<h2>Synchronization</h2>
<p>With that much preparation from scanning and comparing, the synching process can work smoothly now.</p>
<p>When the local version and the global version of a file mismatch, the application compares all chunk IDs of the local file and those of the global file (from the target device). Subsequently, the discrepancy chunks are transferred from the global file to the local one.</p>
<p>That's what happens inside Synchthing. It may take a few minutes to read but the Synchthing team has spend months (or even years) to make it accesible to us.<br />
Let's take a moment to commend their work.</p>
<h2>Connection (Part 2)</h2>
<p>Everything works flawlessly, the idea is splendid, why do we need this section?<br />
Maybe it works ... but not for me.</p>
<p>Somehow my devices can't find each other. To tell the truth, I don't know the reason.<br />
This seems to be a popular issue, you can easily find many dicussion about this (<a href="https://forum.syncthing.net/t/syncthing-dial-tcp-i-o-timeout/22028/10">link</a> or <a href="https://forum.syncthing.net/t/connection-issue-i-o-timeout-connection-refused/15671">link</a>)</p>
<p>I need to find a more reliable solution. Fortunately, I just need to make my devices visible to each other, all the synchronization are already handled by Syncthing.</p>
<p>That's when I discover Tailscale, a free and open-source application dedicated to connecting devices.</p>
<p>Why does that solve my problem?<br />
To be frank, I don't understand what the problem actually is. I just try and it works.<br />
After reading the Tailscale <a href="https://tailscale.com/blog/how-nat-traversal-works">post</a>, I notice one thing that Syncthing does not mention. Those might be what Syncthing is missing.</p>
<p>I will make use of the dorm analogy again for easier understanding.</p>
<p><strong>The problem is:</strong><br />
The dorm manager does not allow anything sent to your friend, if he hasn't sent anything to you first.<br />
What an annoying man! That means neither you nor your friend can send first.<br />
So... we're stuck? But Tailscale works, they must have some tricks in their hand, right?</p>
<p>Just as you figure, Tailscale does a thing called &quot;NAT hole punching&quot;. In this case, after you and your friend have the address, both of you just repeatively send mails to each other. The first time fails, but from the second time onward, it does the trick.</p>
<img class="image-box" loading="lazy" src="/media/Pasted_image_20250814221528.png" alt="" width="892" height="245" style="max-width: 80%; max-height: 70vh; width: auto; height: auto; margin-left: auto; margin-right: auto;"/>
<p>The real challenge here is, the acceptance window is really small. They don't mention the details but I think it only lasts a few seconds.</p>
<h2>Conclusion</h2>
<p>All the pieces are gathered, I can enjoy note-taking everywhere from now on.<br />
This blog is not as long as the first one, but I also learn a lot from this journey.<br />
Hope you find those knowledge helpful sometime in the future.</p>
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
	