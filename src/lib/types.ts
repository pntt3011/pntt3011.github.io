export type Post = {
    id: string;
    title: string;
    preview: string;
    creation_time: number;
    tags?: string[];
};

export type ClientPost = {
    id: string;
    title: string;
    preview: string;
    creation_time: string;
    tags?: string[];
};

export function converToClientPost(post: Post): ClientPost {
    return {
        id: post.id,
        title: post.title,
        preview: post.preview,
        creation_time: formatDate(post.creation_time),
        tags: post.tags ? post.tags.map(tag => tag.toLowerCase()) : []
    };
}

function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
}