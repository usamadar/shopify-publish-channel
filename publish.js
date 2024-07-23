require('dotenv').config();
const axios = require('axios');

const SHOPIFY_ADMIN_API_KEY = process.env.SHOPIFY_ADMIN_API_KEY;
const SHOP_NAME = process.env.SHOP_NAME;

if (!SHOP_NAME || !SHOPIFY_ADMIN_API_KEY) {
  console.error('Please make sure SHOP_NAME and SHOPIFY_ADMIN_API_KEY are set in the .env file');
  process.exit(1);
}

if (process.argv.length < 4) {
  console.error('Please provide source publication ID and one or more destination publication IDs');
  process.exit(1);
}

const [sourcePublicationId, ...destinationPublicationIds] = process.argv.slice(2);

const formatPublicationId = (id) => `gid://shopify/Publication/${id}`;

const getUnpublishedProducts = async (sourcePublicationId, destinationPublicationIds) => {
  let productsToPublish = [];
  let hasNextPage = true;
  let cursor = null;

  const query = `
    query GetProducts($sourcePublicationId: ID!, $after: String) {
      products(first: 250, after: $after) {
        edges {
          cursor
          node {
            id
            publishedOnSource: publishedOnPublication(publicationId: $sourcePublicationId)
            ${destinationPublicationIds.map((id, index) => `
              publishedOnDestination${index}: publishedOnPublication(publicationId: "${formatPublicationId(id)}")
            `).join('\n')}
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `;

  while (hasNextPage) {
    try {
      const response = await axios.post(
        `https://${SHOP_NAME}.myshopify.com/admin/api/2024-07/graphql.json`,
        {
          query,
          variables: {
            sourcePublicationId: formatPublicationId(sourcePublicationId),
            after: cursor
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.errors) {
        console.error('GraphQL errors:', response.data.errors);
        throw new Error('GraphQL errors occurred');
      }

      const edges = response.data.data.products.edges;
      productsToPublish = productsToPublish.concat(
        edges.filter(edge => {
          const node = edge.node;
          return node.publishedOnSource && destinationPublicationIds.some((id, index) => !node[`publishedOnDestination${index}`]);
        })
      );

      hasNextPage = response.data.data.products.pageInfo.hasNextPage;
      cursor = edges.length ? edges[edges.length - 1].cursor : null;
    } catch (error) {
      console.error('Error fetching products:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  return productsToPublish.map(edge => edge.node.id);
};

const publishProductToChannels = async (productId, publicationIds) => {
  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          availablePublicationsCount {
            count
          }
          resourcePublicationsCount {
            count
          }
        }
        shop {
          publicationCount
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: productId,
    input: publicationIds.map(publicationId => ({ publicationId: formatPublicationId(publicationId) }))
  };

  try {
    await axios.post(
      `https://${SHOP_NAME}.myshopify.com/admin/api/2024-07/graphql.json`,
      {
        query: mutation,
        variables: variables
      },
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Published product with ID: ${productId}`);
  } catch (error) {
    console.error(`Error publishing product with ID ${productId}:`, error.response ? error.response.data : error.message);
  }
};

const main = async () => {
  try {
    const productsToPublish = await getUnpublishedProducts(sourcePublicationId, destinationPublicationIds);
    const totalProducts = productsToPublish.length;
    console.log(`Total products to be updated: ${totalProducts}`);

    for (let i = 0; i < totalProducts; i++) {
      const productId = productsToPublish[i];
      await publishProductToChannels(productId, destinationPublicationIds);
      console.log(`Processed ${i + 1} / ${totalProducts}`);
    }

    console.log('All eligible products have been successfully published to the new channels.');
  } catch (error) {
    console.error('Error publishing products:', error.response ? error.response.data : error.message);
  }
};

main();
