import React, { useState, useEffect } from "react";
import ProductCard from './ProductCard.js'
import { makeStyles } from '@material-ui/core/styles'
import {
    Grid
} from '@material-ui/core/'
import Container from '@material-ui/core/Container';
import Button from '@material-ui/core/Button';
import FreebayAPI from '../../Api.js'
import { useLocation} from 'react-router-dom';
import CircularProgress from '@material-ui/core/CircularProgress';
import useStyles from './Stylings/styleProductCard.js'


// The list of product categories when a user clicks on a subcategory
// that is listed within the categories navigation bar


function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const ProductList = () => {
  const classes = useStyles();
  const [products, setProducts] = useState([]);
  // grab the number of the page
  let query = useQuery()
  let subCategory = query.get("subCategory")
  let page = query.get("page")
  if (!page) {
    page = "1"
  }

  let searchObject = {
    page: page,
    subCategory: subCategory
  }

  console.log("searchObject", searchObject)
 //grab products
  useEffect(() => {
    async function getProductsInCategory() {
      let res = await FreebayAPI.getProducts(searchObject);
      setProducts(res);
      console.log("products", products)
    }
    getProductsInCategory()
  }, []);


  // grab the next page number
  const nextPage = (parseInt(page) + 1).toString()
  console.log("nextPage", nextPage)

  query.set("page", nextPage)
  
  const nextPageQuery = query.toString()
  console.log("nextPageQuery", nextPageQuery)

  // grab the previous page number
  let prevPage;
  console.log("declared prevPage Boolean Value", Boolean(prevPage))
  if (parseInt(page) > 1) {
    prevPage = (parseInt(page) - 1).toString()

    console.log("prevPage", prevPage)

    query.set("page", prevPage)
    
    const prevPageQuery = query.toString()
    console.log("prevPageQuery", prevPageQuery)
  }



  // Add "Clothing & Accessories to title if in fashion category"
  let categoryTitle;

  if (subCategory === "Women" || subCategory === "Men" || subCategory === "Boys" || subCategory === "Girls" || subCategory === "Baby"){
    categoryTitle = subCategory + " Clothing & Accessories"
  } else {
    categoryTitle = subCategory
  }

  if (!products) return <CircularProgress />;

  return (
    <Container>
      <h1>{categoryTitle}</h1>
      <Grid container spacing={3}>
        {products.map((product) =>{
          return <Grid item s={4} m={3} spacing={3}>
                    <ProductCard id={product["id"]} imageUrl = {product["imageUrl"]} name ={product["name"]} bidPrice = {product["marketPrice"]} rating = {product["rating"]} numOfRatings = {product["numOfRatings"]} auctionEndDt = {product["auctionEndDt"]}/>
                  </Grid>
        })}
      </Grid>
      <Grid container justify="center">
        {(!prevPage)
        ? <Button size="medium" className={classes.button} disabled>
            {"< Previous page"}
          </Button>
        : <Button size="medium" className={classes.button}>
            {"< Previous page"}
          </Button>}
      <Button size="medium" className={classes.button} href={"/products?" + nextPageQuery}>
          {"Next page >"}
      </Button>
      </Grid>
      </Container>
      )
};

export default ProductList;