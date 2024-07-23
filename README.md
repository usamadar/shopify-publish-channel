# shopify-publish-channel

Publish Shopify Products from one Channel to another. It will query all products published on <source channel> and publish them to <destination channel> only if they are unpublished. 

```
node publish.js <source channel> <destination channel>
```

The source and destination channels are just IDs and not in gid format. For example. 

```
node publish.js 114107023499 212376813834
```

you can use the following GraphQL query to get the IDs of the source and the destination  channels. 

```
query GetPublications {
  publications(first: 20) {
    edges {
      node {
        id
        name
      }
    }
  }
}
```
This script can also optionally accept a list of destination channel IDs, in that case, it will check if the product is published to the source channel and if it is not published to any of the destination channels it will publish them all again. 
