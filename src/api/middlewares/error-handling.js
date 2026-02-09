const GlobalErrorHandler = (err,req,res,next) => {
    console.error("Error:",err.message);

    if(err.name === "NotFoundError"){
        return res.status(404).json({ message : err.message });
    }

    if(err.name === "ValidationError"){
        return res.status(401).json({ message : err.message });
    }

    if(err.name === "forbiddenError"){
        return res.status(403).json({ message : err.message });
    }

    res.status(500).json({ message : "Internal server error "});
}

export default GlobalErrorHandler;


